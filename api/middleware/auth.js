const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

async function requireAuthentication(req, res, next) {
  try {
    const authHeader = req.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authorization header missing or invalid format",
      });
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    try {
      // Verify and decode the JWT token
      const payload = jwt.verify(token, process.env.JWT_SECRET_KEY);

      // Fetch the actual user from database to verify they still exist
      // and get current role/status
      const user = await User.findById(payload.userId).select("+password");

      if (!user) {
        return res.status(401).json({
          error: "User not found or token invalid",
        });
      }

      // Verify the email in token matches database
      if (user.email !== payload.email) {
        return res.status(401).json({
          error: "Token validation failed",
        });
      }

      // Attach the CURRENT user info from database to request object
      // This ensures we have the most up-to-date role and user data
      req.user = {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        name: user.name,
        // Include the full user object if needed elsewhere
        userData: user,
      };

      next();
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "Token has expired",
        });
      } else if (jwtError.name === "JsonWebTokenError") {
        return res.status(401).json({
          error: "Invalid token",
        });
      } else {
        return res.status(401).json({
          error: "Token verification failed",
        });
      }
    }
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

function requireAdmin(req, res, next) {
  // Now using the role from the database (via req.user.role)
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    return res.status(403).json({
      error: "Admin access required",
    });
  }
}

function requireInstructor(req, res, next) {
  if (
    req.user &&
    (req.user.role === "instructor" || req.user.role === "admin")
  ) {
    next();
  } else {
    return res.status(403).json({
      error: "Instructor or admin access required",
    });
  }
}

// Middleware to check if user owns the resource or is admin
function requireOwnershipOrAdmin(resourceUserIdField = "userId") {
  return (req, res, next) => {
    const resourceUserId =
      req.params[resourceUserIdField] || req.body[resourceUserIdField];

    if (req.user.role === "admin" || req.user.userId === resourceUserId) {
      next();
    } else {
      return res.status(403).json({
        error: "Access denied: insufficient permissions",
      });
    }
  };
}

module.exports = {
  requireAuthentication,
  requireAdmin,
  requireInstructor,
  requireOwnershipOrAdmin,
};
