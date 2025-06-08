const router = require('express').Router();
const { userBasedRateLimit, ipBasedRateLimit } = require('./middleware/ratelimit');
const { requireAuthentication, requireAdmin } = require('./middleware/auth');


// Optional authentication middleware that doesn't fail for missing or invalid tokens
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No token - continue as anonymous user
      req.user = null;
      return next();
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    try {
      // Try to verify the JWT token
      const jwt = require("jsonwebtoken");
      const payload = jwt.verify(token, process.env.JWT_SECRET_KEY);

      // For testing purposes, we'll create a mock user object
      // In a real scenario, you'd fetch from database
      req.user = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        name: payload.name || 'Test User'
      };

      next();
    } catch (jwtError) {
      // Invalid token - continue as anonymous user (don't return 401)
      console.log('Invalid token provided, treating as anonymous user');
      req.user = null;
      next();
    }
  } catch (error) {
    console.error('Optional auth error:', error);
    // On any error, continue as anonymous
    req.user = null;
    next();
  }
};

// Test endpoint with user-based rate limiting
router.get('/', optionalAuth, userBasedRateLimit, (req, res) => {
  const userInfo = req.user ? {
    userId: req.user.userId,
    email: req.user.email,
    role: req.user.role,
    name: req.user.name
  } : {
    type: 'anonymous',
    ip: req.ip
  };

  res.json({
    message: 'Rate limit test endpoint',
    timestamp: new Date().toISOString(),
    user: userInfo,
    rateLimitInfo: {
      limit: res.get('X-RateLimit-Limit'),
      remaining: res.get('X-RateLimit-Remaining'),
      reset: res.get('X-RateLimit-Reset'),
      userType: res.get('X-RateLimit-User-Type')
    }
  });
});

// IP-based rate limiting test endpoint
router.get('/ip', ipBasedRateLimit, (req, res) => {
  res.json({
    message: 'IP-based rate limit test endpoint',
    timestamp: new Date().toISOString(),
    ip: req.ip,
    rateLimitInfo: {
      limit: res.get('X-RateLimit-Limit'),
      remaining: res.get('X-RateLimit-Remaining'),
      reset: res.get('X-RateLimit-Reset')
    }
  });
});

// User info endpoint (requires authentication)
router.get('/me', requireAuthentication, userBasedRateLimit, (req, res) => {
  res.json({
    message: 'User info',
    user: req.user,
    rateLimitInfo: {
      limit: res.get('X-RateLimit-Limit'),
      remaining: res.get('X-RateLimit-Remaining'),
      reset: res.get('X-RateLimit-Reset'),
      userType: res.get('X-RateLimit-User-Type')
    }
  });
});

// Admin-only endpoint
router.get('/admin-only', requireAuthentication, requireAdmin, userBasedRateLimit, (req, res) => {
  res.json({
    message: 'Admin-only resource',
    data: 'Sensitive admin data here',
    user: req.user,
    rateLimitInfo: {
      limit: res.get('X-RateLimit-Limit'),
      remaining: res.get('X-RateLimit-Remaining'),
      reset: res.get('X-RateLimit-Reset'),
      userType: res.get('X-RateLimit-User-Type')
    }
  });
});

// Health check endpoint (no rate limiting)
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'Test router health check'
  });
});

module.exports = { router };