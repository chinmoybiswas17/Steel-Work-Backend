const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const res = require("express/lib/response");
const uri = "mongodb+srv://dbserver1:aqpElAsqOtisbzVu@cluster0.fmysb7b.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    } else {
      req.decoded = decoded;
      next();
    }
  });
}

async function run() {
  try {
    await client.connect();
    console.log("mongo eating steel");

    const toolsCollection = client.db("alpha_steelwork").collection("tools");
    const ordersCollection = client.db("alpha_steelwork").collection("orders");
    const paymentsCollection = client
      .db("alpha_steelwork")
      .collection("payments");
    const usersCollection = client.db("alpha_steelwork").collection("users");
    const reviewsCollection = client
      .db("alpha_steelwork")
      .collection("reviews");

    //----------------------------  GET api ---------------------------- //

    // all tools
    app.get("/tools", async (req, res) => {
      const tools = await toolsCollection.find().toArray();
      res.send(tools.reverse());
    });

    // single tool
    app.get("/tool/purchase/:purchaseId", verifyJWT, async (req, res) => {
      const id = req.params.purchaseId;
      const query = { _id: ObjectId(id) };
      const tool = await toolsCollection.findOne(query);
      res.send(tool);
    });

    // my orders
    app.get("/order", verifyJWT, async (req, res) => {
      const customer = req.query.customer;
      const decodedEmail = req.decoded.email;
      if (customer === decodedEmail) {
        const orders = await ordersCollection
          .find({ customer: customer })
          .toArray();
        return res.send(orders);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    // single order
    app.get("/order/:id", verifyJWT, async (req, res) => {
      const product = req.params.id;
      const query = { _id: ObjectId(product) };
      const order = await ordersCollection.findOne(query);
      res.send(order);
    });

    // current user
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      res.send(user);
    });

    // all user
    app.get("/users", verifyJWT, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // check admin role
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    // all reviews
    app.get("/reviews", async (req, res) => {
      const reviews = await reviewsCollection.find().toArray();
      res.send(reviews.reverse());
    });

    // all orders // admin
    app.get("/orders", verifyJWT, async (req, res) => {
      const orders = await ordersCollection.find().toArray();
      res.send(orders);
    });

    //----------------------------  POST api ---------------------------- //

    // post order
    app.post("/order", async (req, res) => {
      const order = req.body;
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    // post new tool
    app.post("/tools", verifyJWT, async (req, res) => {
      const tool = req.body;
      const result = await toolsCollection.insertOne(tool);
      res.send(result);
    });

    // post new review
    app.post("/reviews", verifyJWT, async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const shouldPay = req.body.shouldPay;
      const amount = shouldPay * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    //----------------------------  PUT api ---------------------------- //

    // update user data from my profile
    app.put("/users/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      console.log(user, email);
      const filter = { email: email };
      const updateDoc = {
        $set: {
          education: user.education,
          address: user.address,
          contact: user.contact,
          linkedIn: user.linkedIn,
          faceBook: user.faceBook,
          hobby: user.hobby,
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // update user on signUp
    app.put("/users", async (req, res) => {
      const email = req.query.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        {
          expiresIn: "1h",
        }
      );
      res.send({ result, token });
    });

    // make admin
    app.put("/users/admin/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const requester = req.decoded.email;
      const requesterInfo = await usersCollection.findOne({ email: requester });
      if (requesterInfo.role === "admin") {
        const filter = { _id: ObjectId(id) };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        return res.send(result);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    // update payment status // add payment in paymentCollection
    app.put("/orders/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      const newPayment = await paymentsCollection.insertOne(payment);
      res.send(result);
    });

    // set shipment
    app.put("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          shipment: true,
        },
      };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //----------------------------  DELETE api ---------------------------- //

    // delete my order
    app.delete("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const order = { _id: ObjectId(id) };
      const result = await ordersCollection.deleteOne(order);
      res.send(result);
    });

    // delete tool from database
    app.delete("/tool/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const tool = { _id: ObjectId(id) };
      const result = await toolsCollection.deleteOne(tool);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Iron worker continues to hit");
});

app.listen(port, (req, res) => {
  console.log("steel hitting up on", port);
});
