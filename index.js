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


async function mongoConnect() {
    console.log(`Attempting to connect to MongoDB at mongodb://${username}:***@mongodb:27017/${dbname}`);
    await mongoose.connect(`mongodb://${username}:${password}@mongodb:27017/${dbname}?authSource=admin`);
    console.log("Connected to MongoDB");

}


async function startServer() {
  try {
    // Connect to MongoDB first
    await mongoConnect();
    
    // Start Express server only after successful connection
    app.listen(port, function() {
      console.log("== Server is running on port", port, "+++");
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);  // Exit with failure
  }
}

startServer();