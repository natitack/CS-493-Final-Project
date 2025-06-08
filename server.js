const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');

const api = require('./api');

const app = express();
const port = process.env.PORT || 8000;
const username = process.env.MONGO_INITDB_ROOT_USERNAME;
const password = process.env.MONGO_INITDB_ROOT_PASSWORD;
const dbname = process.env.MONGO_INITDB_DATABASE;
const User = require('./models/userModel'); 

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

async function ensureDefaultUsers() {
  try {
    // Admin user from environment variables
    const testUsers = [
      {
      name: process.env.ADMIN_NAME || 'Admin User',
      email: process.env.ADMIN_EMAIL || 'admin@example.com',
      password: process.env.ADMIN_PASSWORD || 'adminpassword',
      role: 'admin'
      },
      {
      name: process.env.TEST_INSTRUCTOR_NAME || 'Test Instructor',
      email: process.env.TEST_INSTRUCTOR_EMAIL || 'instructor@example.com',
      password: process.env.TEST_INSTRUCTOR_PASSWORD || 'instructorpassword',
      role: 'instructor'
      },
      {
      name: process.env.TEST_STUDENT_NAME || 'Test Student',
      email: process.env.TEST_STUDENT_EMAIL || 'student@example.com',
      password: process.env.TEST_STUDENT_PASSWORD || 'studentpassword',
      role: 'student'
      }
    ];

    // Only create test users in development/testing environments
    const createTestUsers = process.env.NODE_ENV !== 'production' || process.env.CREATE_TEST_USERS === 'true';

    for (const userData of testUsers) {
      // Skip if this is the admin user and we're not creating test users
      if (userData.role !== 'admin' && !createTestUsers) {
        continue;
      }

      // Skip if required data is missing
      if (!userData.email || !userData.password) {
        if (userData.role === 'admin') {
          console.warn('Admin email/password not provided in environment variables');
        }
        continue;
      }

      const existingUser = await User.findOne({ email: userData.email });
      
      if (!existingUser) {
        const user = new User({
          name: userData.name,
          email: userData.email,
          password: userData.password, // Your User model should hash this in pre-save hook
          role: userData.role
        });
        
        await user.save();
        console.log(`✓ Created ${userData.role} user: ${userData.email}`);
      } else {
        console.log(`- ${userData.role} user already exists: ${userData.email}`);
      }
    }

    if (createTestUsers) {
      console.log('Test users are ready for tests');
    }

  } catch (error) {
    console.error('Error ensuring default users:', error);
  }
}

// Import and initialize Redis before starting server
const { initRedis } = require('./api/middleware/ratelimit');

async function startServer() {
  try {
    // Initialize Redis connection
    await initRedis();

    // Connect to MongoDB
    await mongoConnect();

    // Create admin and test users
    await ensureDefaultUsers();

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