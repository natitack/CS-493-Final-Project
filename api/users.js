const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { requireAuthentication } = require('./middleware/auth');

const router = express.Router();

// Helper functions
const validateUserCreationInput = (name, email, password) => {
  if (!name || !email || !password) {
    return { isValid: false, error: 'Name, email, and password are required' };
  }
  return { isValid: true };
};

const validateLoginInput = (email, password) => {
  if (!email || !password) {
    return { isValid: false, error: 'Email and password are required' };
  }
  return { isValid: true };
};

const checkRoleAuthorization = (requestedRole, currentUserRole) => {
  const privilegedRoles = ['admin', 'instructor'];
  const isRequestingPrivilegedRole = privilegedRoles.includes(requestedRole);
  const isCurrentUserAdmin = currentUserRole === 'admin';
  
  return !isRequestingPrivilegedRole || isCurrentUserAdmin;
};

const generateAuthToken = (user) => {
  return jwt.sign(
    { 
      userId: user._id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET_KEY || 'your-secret-key',
    { expiresIn: '24h' }
  );
};

const checkUserAccessPermission = (requestedUserId, currentUser) => {
  return currentUser.userId === requestedUserId || currentUser.role === 'admin';
};

const populateUserByRole = async (userId, userRole) => {
  const populationOptions = {
    instructor: 'coursesTaught',
    student: 'coursesEnrolled'
  };
  
  const populateField = populationOptions[userRole];
  
  if (populateField) {
    return await User.findById(userId).populate(populateField);
  }
  
  return await User.findById(userId);
};

const sanitizeUserResponse = (user) => {
  const userResponse = user.toJSON();
  delete userResponse.password;
  return userResponse;
};

// POST /users - Create a new user
router.post('/', requireAuthentication, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Input validation
    const validation = validateUserCreationInput(name, email, password);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }

    // Authorization check for privileged roles
    if (!checkRoleAuthorization(role, req.user.role)) {
      return res.status(403).json({
        error: 'Only admin users can create admin or instructor accounts'
      });
    }

    // Check for existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        error: 'User with this email already exists'
      });
    }

    // Create and save new user
    const newUser = new User({
      name,
      email,
      password,
      role: role || 'student'
    });

    await newUser.save();

    res.status(201).json({
      id: newUser._id.toString()
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /users/login - Authenticate user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Input validation
    const validation = validateLoginInput(email, password);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate and return JWT token
    const token = generateAuthToken(user);
    res.status(200).json({ token });

  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /users/:id - Get user by ID
router.get('/:id', requireAuthentication, async (req, res) => {
  try {
    const { id } = req.params;

    // Authorization check
    if (!checkUserAccessPermission(id, req.user)) {
      return res.status(403).json({
        error: 'The request was not made by an authenticated User satisfying the authorization criteria described above.'
      });
    }

    // Find user by ID
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        error: 'Specified Course `id` not found.'
      });
    }

    // Populate user data based on role
    const populatedUser = await populateUserByRole(id, user.role);

    // Sanitize response (remove password)
    const userResponse = sanitizeUserResponse(populatedUser);

    res.status(200).json(userResponse);

  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router };