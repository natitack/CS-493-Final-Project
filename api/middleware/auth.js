const jwt = require("jsonwebtoken");
const User = require("../../models/userModel");

// Constants
const JWT_SECRET = process.env.JWT_SECRET_KEY;
const BEARER_PREFIX = "Bearer ";
const BEARER_PREFIX_LENGTH = 7;

// Error messages
const ERROR_MESSAGES = {
  MISSING_AUTH_HEADER: "Authorization header missing or invalid format",
  USER_NOT_FOUND: "User not found or token invalid",
  TOKEN_VALIDATION_FAILED: "Token validation failed",
  TOKEN_EXPIRED: "Token has expired",
  INVALID_TOKEN: "Invalid token",
  TOKEN_VERIFICATION_FAILED: "Token verification failed",
  INTERNAL_SERVER_ERROR: "Internal server error",
  ADMIN_ACCESS_REQUIRED: "Admin access required",
  INSTRUCTOR_ACCESS_REQUIRED: "Instructor or admin access required",
  ACCESS_DENIED: "Access denied: insufficient permissions"
};

// Helper functions
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }
  return authHeader.slice(BEARER_PREFIX_LENGTH);
};

const verifyJwtToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

const validateUserAgainstToken = (user, payload) => {
  if (!user) {
    return { isValid: false, error: ERROR_MESSAGES.USER_NOT_FOUND };
  }
  
  if (user.email !== payload.email) {
    return { isValid: false, error: ERROR_MESSAGES.TOKEN_VALIDATION_FAILED };
  }
  
  return { isValid: true };
};

const buildUserContext = (user) => {
  return {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    name: user.name,
    userData: user
  };
};

const handleJwtError = (jwtError) => {
  const errorHandlers = {
    TokenExpiredError: ERROR_MESSAGES.TOKEN_EXPIRED,
    JsonWebTokenError: ERROR_MESSAGES.INVALID_TOKEN
  };
  
  return errorHandlers[jwtError.name] || ERROR_MESSAGES.TOKEN_VERIFICATION_FAILED;
};

const sendErrorResponse = (res, statusCode, message) => {
  return res.status(statusCode).json({ error: message });
};

const hasRole = (user, allowedRoles) => {
  return user && allowedRoles.includes(user.role);
};

const hasOwnershipOrAdminAccess = (user, resourceUserId) => {
  return user.role === "admin" || user.userId === resourceUserId;
};

// Main authentication middleware
async function requireAuthentication(req, res, next) {
  try {
    const authHeader = req.get("Authorization");
    
    // Extract and validate token from header
    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      return sendErrorResponse(res, 401, ERROR_MESSAGES.MISSING_AUTH_HEADER);
    }

    try {
      // Verify JWT token
      const payload = verifyJwtToken(token);

      // Fetch current user from database
      const user = await User.findById(payload.userId);

      // Validate user against token payload
      const validation = validateUserAgainstToken(user, payload);
      if (!validation.isValid) {
        return sendErrorResponse(res, 401, validation.error);
      }

      // Attach user context to request
      req.user = buildUserContext(user);
      
      next();

    } catch (jwtError) {
      const errorMessage = handleJwtError(jwtError);
      return sendErrorResponse(res, 401, errorMessage);
    }

  } catch (error) {
    console.error("Authentication error:", error);
    return sendErrorResponse(res, 500, ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }
}

// Role-based authorization middlewares
function requireAdmin(req, res, next) {
  if (hasRole(req.user, ["admin"])) {
    return next();
  }
  
  return sendErrorResponse(res, 403, ERROR_MESSAGES.ADMIN_ACCESS_REQUIRED);
}

function requireInstructor(req, res, next) {
  if (hasRole(req.user, ["instructor", "admin"])) {
    return next();
  }
  
  return sendErrorResponse(res, 403, ERROR_MESSAGES.INSTRUCTOR_ACCESS_REQUIRED);
}

// Resource ownership or admin access middleware factory
function requireOwnershipOrAdmin(resourceUserIdField = "userId") {
  return (req, res, next) => {
    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];

    if (hasOwnershipOrAdminAccess(req.user, resourceUserId)) {
      return next();
    }
    
    return sendErrorResponse(res, 403, ERROR_MESSAGES.ACCESS_DENIED);
  };
}

module.exports = {
  requireAuthentication,
  requireAdmin,
  requireInstructor,
  requireOwnershipOrAdmin
};