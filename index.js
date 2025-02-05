const express = require("express");
const cors = require("cors");
const moment = require("moment");
const jwt = require("jsonwebtoken") // Import Moment.js
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u51v8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );

    // rooms related apis
    const roomsCollection = client.db("hotelRoomBooking").collection("rooms");
    const userCollection = client.db("hotelRoomBooking").collection("users");
    const bookingsCollection = client
      .db("hotelRoomBooking")
      .collection("bookings");
    const reviewsCollection = client
      .db("hotelRoomBooking")
      .collection("reviews");

    app.get("/rooms", async (req, res) => {
      const cursor = roomsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // auth related apis
    app.post('/jwt', async(req,res) => {
      const user = req.body;
      const token = jwt.sign(user, 'secret', {expiresIn: '1hr'})
      res.send(token);
    })

    app.get("/rooms/filter", async (req, res) => {
      try {
        // Get the minPrice and maxPrice from the query parameters
        const { minPrice, maxPrice } = req.query;

        // If either minPrice or maxPrice is not provided, return all rooms
        let filter = {};
        if (minPrice || maxPrice) {
          filter = {
            price: {},
          };

          // Set minPrice filter if available
          if (minPrice) {
            filter.price.$gte = parseFloat(minPrice);
          }

          // Set maxPrice filter if available
          if (maxPrice) {
            filter.price.$lte = parseFloat(maxPrice);
          }
        }

        // Fetch rooms with the filter
        const cursor = roomsCollection.find(filter);
        const result = await cursor.toArray();

        // Send the filtered rooms as the response
        res.send(result);
      } catch (error) {
        console.error("Error fetching filtered rooms:", error);
        res.status(500).send("Internal server error");
      }
    });

    // Add this new route for fetching a single room by ID
    app.get("/rooms/:id", async (req, res) => {
      const id = req.params.id;

      // Validate MongoDB ObjectId
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid ID format" });
      }

      const query = { _id: id };
      const result = await roomsCollection.findOne(query);

      if (!result) {
        return res.status(404).json({ error: "Room not found" });
      }

      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const { uid, email, name, photoURL } = req.body; // Changed 'photo' to 'photoURL'
    
      // Validate input
      if (!uid || !email || !name || !photoURL) {
        return res.status(400).json({ error: "All fields are required" });
      }
    
      // Check if user already exists
      const existingUser = await userCollection.findOne({ uid });
      if (existingUser) {
        return res.status(200).json({ message: "User already exists" });
      }
    
      // Create a new user
      const newUser = { uid, email, name, photoURL }; 
      const result = await userCollection.insertOne(newUser);
    
      res.status(201).json(result);
    });
    

    app.post("/bookings", async (req, res) => {
      const { uid, roomId, checkIn, checkOut, guests, totalPrice } = req.body;

      // Validate input fields
      if (!uid || !roomId || !checkIn || !checkOut || !guests || !totalPrice) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Validate Room ID format
      if (!ObjectId.isValid(roomId)) {
        return res.status(400).json({ error: "Invalid Room ID format" });
      }

      // Check if room exists and is available
      const room = await roomsCollection.findOne({ _id: roomId });

      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      if (!room.availability) {
        return res
          .status(400)
          .json({ error: "Room is not available for booking." });
      }

      // Create a new booking
      const newBooking = {
        uid,
        roomId,
        checkIn,
        checkOut,
        guests,
        totalPrice,
        createdAt: new Date(),
      };

      try {
        // Insert booking
        const result = await bookingsCollection.insertOne(newBooking);

        // Update room availability to 'false'
        await roomsCollection.updateOne(
          { _id: roomId },
          { $set: { availability: false } }
        );

        res.status(201).json({ message: "Booking confirmed", booking: result });
      } catch (error) {
        res.status(500).json({ error: "Failed to confirm booking" });
      }
    });

    // Get bookings for a specific user
    // Get bookings for a specific user
    app.get("/bookings/:uid", async (req, res) => {
      const { uid } = req.params;

      try {
        if (!uid) {
          return res.status(400).json({ error: "User ID is required." });
        }

        const bookings = await bookingsCollection.find({ uid }).toArray();

        // Fetch room details for each booking
        const detailedBookings = await Promise.all(
          bookings.map(async (booking) => {
            const room = await roomsCollection.findOne({
              _id: booking.roomId, // Convert roomId to ObjectId
            });

            // Merge room details into booking data
            return { ...booking, room };
          })
        );

        res.status(200).json(detailedBookings);
      } catch (error) {
        console.error("Error fetching bookings:", error.message);
        res.status(500).json({ error: "Internal server error." });
      }
    });

    app.put("/bookings/:id", async (req, res) => {
      const { id } = req.params; // Get booking ID
      const { checkIn, checkOut } = req.body; // Get new dates

      try {
        // Validate Booking ID
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid Booking ID." });
        }

        // Update booking dates
        const result = await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              checkIn,
              checkOut,
              updatedAt: new Date(), // Track update time
            },
          }
        );

        // Check if booking was updated
        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .json({ error: "Booking not found or no changes." });
        }

        res
          .status(200)
          .json({ message: "Booking dates updated successfully!" });
      } catch (error) {
        console.error("Error updating booking dates:", error.message);
        res.status(500).json({ error: "Internal server error." });
      }
    });

    app.delete("/bookings/:id", async (req, res) => {
      const { id } = req.params;
    
      try {
        // Validate booking ID
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid Booking ID." });
        }
    
        // Find the booking to get the room ID and checkIn date
        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(id),
        });
    
        if (!booking) {
          return res.status(404).json({ error: "Booking not found." });
        }
    
        // Ensure checkIn is a valid date object
        const checkInDate = moment(booking.checkIn); // This should be parsed as a moment object
        const currentDate = moment().startOf('day'); // Get the current date at midnight to ignore the time component
    
        // Debugging: Log current date and check-in date
        console.log("Current Date: ", currentDate.format("YYYY-MM-DD"));
        console.log("Check-In Date: ", checkInDate.format("YYYY-MM-DD"));
    
        // Compare the checkIn date and current date, ensuring at least 1 day difference
        const diffInDays = checkInDate.diff(currentDate, "days"); // Difference in days
    
        console.log("Difference in days: ", diffInDays); // Log difference in days for debugging
    
        if (diffInDays <= 1) {
          return res.status(400).json({
            error: "You can only cancel a booking at least 1 day before the check-in date.",
          });
        }
    
        // Delete the booking
        const result = await bookingsCollection.deleteOne({
          _id: new ObjectId(id),
        });
    
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Failed to delete booking." });
        }
    
        // Update the room's availability to true
        const updateResult = await roomsCollection.updateOne(
          { _id: booking.roomId },
          { $set: { availability: true } } // Set availability to true
        );
    
        if (updateResult.modifiedCount === 0) {
          return res
            .status(500)
            .json({ error: "Failed to update room availability." });
        }
    
        res.status(200).json({
          message: "Booking canceled successfully, and room is now available!",
        });
      } catch (error) {
        console.error("Error deleting booking:", error.message);
        res.status(500).json({ error: "Internal server error." });
      }
    });
    

    app.post("/reviews", async (req, res) => {
      const { uid, roomId, rating, comment } = req.body;

      try {
        // Validation
        if (!uid || !roomId || !rating || !comment) {
          return res.status(400).json({ error: "All fields are required." });
        }

        if (!ObjectId.isValid(roomId)) {
          return res.status(400).json({ error: "Invalid Room ID." });
        }

        // Create Review
        const newReview = {
          uid,
          roomId: new ObjectId(roomId),
          rating,
          comment,
          createdAt: new Date(),
        };

        const result = await reviewsCollection.insertOne(newReview);
        res.status(201).json(result);
      } catch (error) {
        console.error("Error adding review:", error.message);
        res.status(500).json({ error: "Internal server error." });
      }
    });

    app.get("/api/reviews", async (req, res) => {
      try {
        // Fetch all reviews
        const reviews = await reviewsCollection.find().toArray();
        console.log("Fetched reviews:", reviews); // Debugging: Check if reviews are being fetched correctly

        res.json(reviews);
      } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.get("/rooms/:id/details", async (req, res) => {
      const { id } = req.params;

      try {
        // Validate the room ID
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid Room ID format." });
        }

        // Fetch room details
        const room = await roomsCollection.findOne({ _id: id });

        if (!room) {
          return res.status(404).json({ error: "Room not found." });
        }

        // Fetch reviews for the room
        const reviews = await reviewsCollection
          .find({ roomId: new ObjectId(id) }) // Filter reviews by room ID
          .sort({ createdAt: -1 }) // Sort by latest reviews first
          .toArray();

        // Send room details along with reviews
        res.status(200).json({
          room,
          reviews,
        });
      } catch (error) {
        console.error(
          "Error fetching room details with reviews:",
          error.message
        );
        res.status(500).json({ error: "Internal server error." });
      }
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hotel Booking Server");
});

app.listen(port, () => {
  console.log(`Server id running at: ${port}`);
});
