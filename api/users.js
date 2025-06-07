const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { requireAuthentication } = require('./middleware/auth');

const router = express.Router();

// POST /users - Create a new user
router.post('/', requireAuthentication, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Name, email, and password are required'
      });
    }

    // Check authorization for creating admin/instructor roles
    if ((role === 'admin' || role === 'instructor') && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Only admin users can create admin or instructor accounts'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        error: 'User with this email already exists'
      });
    }

    // Create new user
    const user = new User({
      name,
      email,
      password,
      role: role || 'student'
    });

    await user.save();

    res.status(201).json({
      id: user._id.toString()
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// POST /users/login - Authenticate user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Generate JWT token 
    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET_KEY || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(200).json({
      token
    });

  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// GET /users/:id - Get user by ID
router.get('/:id', requireAuthentication, async (req, res) => {
  try {
    const { id } = req.params;

    // Check authorization - users can only access their own data, admins can access any
    if (req.user.userId !== id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'The request was not made by an authenticated User satisfying the authorization criteria described above.'
      });
    }

    // Find user by ID first
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({
        error: 'Specified Course `id` not found.'
      });
    }

    // Populate virtual fields based on user's role
    let populatedUser;
    if (user.role === 'instructor') {
      populatedUser = await User.findById(id).populate('coursesTaught');
    } else if (user.role === 'student') {
      populatedUser = await User.findById(id).populate('coursesEnrolled');
    } else {
      populatedUser = user;
    }

    // Convert to JSON and remove password
    const userResponse = populatedUser.toJSON();
    delete userResponse.password;

    res.status(200).json(userResponse);

  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = { router };