const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');


const api = require('./api');

const app = express();
const port = process.env.PORT || 8000;
const username = process.env.MONGO_INITDB_ROOT_USERNAME;
const password = process.env.MONGO_INITDB_ROOT_PASSWORD;
const dbname = process.env.MONGO_INITDB_DATABASE;


/*
 * Morgan is a popular logger.
 */
app.use(morgan('dev'));

app.use(express.json());
app.use(express.static('public'));

/*
 * All routes for the API are written in modules in the api/ directory.  The
 * top-level router lives in api/index.js.  That's what we include here, and
 * it provides all of the routes.
 */
app.use('/', api);

app.use('*', function (req, res, next) {
  res.status(404).json({
    error: "Requested resource " + req.originalUrl + " does not exist"
  });
});

/*
 * This route will catch any errors thrown from our API endpoints and return
 * a response with a 500 status to the client.
 */
app.use('*', function (err, req, res, next) {
  console.error("== Error:", err)
  res.status(500).send({
      err: "Server error.  Please try again later."
  })
})

app.set('trust proxy', true); // For proper IP detection behind reverse proxy

async function mongoConnect() {
    try {
        console.log(`Attempting to connect to MongoDB...`);
        await mongoose.connect(`mongodb://${username}:${password}@mongodb:27017/${dbname}?authSource=admin`);
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("MongoDB connection failed:", error);
        throw error; // Let startServer handle it
    }
}

// Import and initialize Redis before starting server
const { initRedis } = require('./middleware/ratelimit');

async function startServer() {
  try {
    // Initialize Redis connection
    await initRedis();

    // Connect to MongoDB
    await mongoConnect();

    // Start Express server
    app.listen(port, function() {
      console.log("== Server is running on port", port, "+++");
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();