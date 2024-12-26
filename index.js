const express = require("express");
const cors = require("cors");
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
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // rooms related apis
    const roomsCollection = client.db("hotelRoomBooking").collection("rooms");
    const userCollection = client.db("hotelRoomBooking").collection("users");


    app.get("/rooms", async (req, res) => {
      const cursor = roomsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Add this new route for fetching a single room by ID
    app.get('/rooms/:id', async (req, res) => {
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
