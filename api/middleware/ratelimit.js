const redis = require("redis");

const redisHost = process.env.REDIS_HOST || "localhost";
const redisPort = process.env.REDIS_PORT || "6379";

const redisClient = redis.createClient({
  url: `redis://${redisHost}:${redisPort}`,
});

// Initialize Redis connection
async function initRedis() {
  try {
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Connected to Redis');
    });

    await redisClient.connect();
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
}

// Role-based rate limits
const RATE_LIMITS = {
  admin: {
    tokenMax: 100,
    windowMs: 60 * 1000, // 1 minute
    tokensPerWindow: 100
  },
  instructor: {
    tokenMax: 50,
    windowMs: 60 * 1000, // 1 minute
    tokensPerWindow: 50
  },
  student: {
    tokenMax: 20,
    windowMs: 60 * 1000, // 1 minute
    tokensPerWindow: 20
  },
  anonymous: {
    tokenMax: 5,
    windowMs: 60 * 1000, // 1 minute
    tokensPerWindow: 5
  }
};

// Rate limit based on authenticated user
async function userBasedRateLimit(req, res, next) {
  try {
    let userId, userRole, limits;
    
    // Check if user is authenticated
    if (req.user && req.user.userId) {
      // Use authenticated user data
      userId = req.user.userId;
      userRole = req.user.role;
      limits = RATE_LIMITS[userRole] || RATE_LIMITS.student;
    } else {
      // Fall back to IP-based rate limiting for unauthenticated users
      userId = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
      userRole = 'anonymous';
      limits = RATE_LIMITS.anonymous;
    }

    const key = `rate_limit:${userRole}:${userId}`;
    const { tokenMax, windowMs, tokensPerWindow } = limits;

    // Get current window start time
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;

    try {
      // Get current bucket data atomically
      const bucketData = await redisClient.hGetAll(key);

      let tokenCount = bucketData.tokenCount ? parseFloat(bucketData.tokenCount) : tokenMax;
      let lastWindow = bucketData.lastWindow ? parseInt(bucketData.lastWindow) : windowStart;

      console.log(`Rate limit check for ${userRole}:${userId} - Current: ${tokenCount}, Window: ${lastWindow}, Now Window: ${windowStart}`);

      // Reset if we're in a new window
      if (lastWindow < windowStart) {
        tokenCount = tokenMax;
        lastWindow = windowStart;
        console.log(`New window detected, resetting to ${tokenMax} tokens`);
      }

      if (tokenCount >= 1) {
        // Allow request and decrement token count
        tokenCount -= 1;
        
        // Save updated state atomically
        await redisClient.hSet(key, {
          tokenCount: tokenCount.toString(),
          lastWindow: lastWindow.toString(),
        });
        
        // Set expiration to prevent key buildup
        await redisClient.expire(key, Math.ceil(windowMs / 1000) + 10);
        
        console.log(`Request allowed, tokens remaining: ${tokenCount}`);
        
        // Set headers for client
        res.set({
          'X-RateLimit-Limit': tokensPerWindow.toString(),
          'X-RateLimit-Remaining': Math.floor(tokenCount).toString(),
          'X-RateLimit-Reset': Math.ceil((windowStart + windowMs) / 1000).toString(),
          'X-RateLimit-User-Type': userRole
        });

        next();
      } else {
        // Rate limit exceeded
        const resetTime = Math.ceil((windowStart + windowMs) / 1000);
        
        console.log(`Rate limit exceeded for ${userRole}:${userId}`);
        
        res.set({
          'X-RateLimit-Limit': tokensPerWindow.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetTime.toString(),
          'X-RateLimit-User-Type': userRole,
          'Retry-After': Math.ceil((windowStart + windowMs - now) / 1000).toString()
        });

        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((windowStart + windowMs - now) / 1000),
          userType: userRole,
          limit: tokensPerWindow
        });
      }
    } catch (redisError) {
      console.error('Redis operation failed:', redisError);
      // Fall back to allowing the request if Redis fails
      console.warn('Rate limiting disabled due to Redis error');
      next();
    }
  } catch (error) {
    console.error('Rate limiting error:', error);
    // Allow request to proceed if rate limiting fails
    next();
  }
}

async function ipBasedRateLimit(req, res, next) {
  try {
    const tokenMax = 10;
    const windowMs = 60 * 1000;
    const tokensPerWindow = 10;
    
    const userIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
    const key = `rate_limit:ip:${userIp}`;

    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;

    try {
      const bucketData = await redisClient.hGetAll(key);

      let tokenCount = bucketData.tokenCount ? parseFloat(bucketData.tokenCount) : tokenMax;
      let lastWindow = bucketData.lastWindow ? parseInt(bucketData.lastWindow) : windowStart;

      if (lastWindow < windowStart) {
        tokenCount = tokenMax;
        lastWindow = windowStart;
      }

      if (tokenCount >= 1) {
        tokenCount -= 1;
        
        await redisClient.hSet(key, {
          tokenCount: tokenCount.toString(),
          lastWindow: lastWindow.toString(),
        });
        
        await redisClient.expire(key, Math.ceil(windowMs / 1000) + 10);
        
        res.set({
          'X-RateLimit-Limit': tokensPerWindow.toString(),
          'X-RateLimit-Remaining': Math.floor(tokenCount).toString(),
          'X-RateLimit-Reset': Math.ceil((windowStart + windowMs) / 1000).toString()
        });

        next();
      } else {
        const resetTime = Math.ceil((windowStart + windowMs) / 1000);
        
        res.set({
          'X-RateLimit-Limit': tokensPerWindow.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetTime.toString(),
          'Retry-After': Math.ceil((windowStart + windowMs - now) / 1000).toString()
        });

        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((windowStart + windowMs - now) / 1000)
        });
      }
    } catch (redisError) {
      console.error('Redis operation failed:', redisError);
      console.warn('Rate limiting disabled due to Redis error');
      next();
    }
  } catch (error) {
    console.error('Rate limiting error:', error);
    next();
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing Redis connection...');
  await redisClient.quit();
  process.exit(0);
});

module.exports = {
  userBasedRateLimit,
  ipBasedRateLimit,
  rateLimit: userBasedRateLimit, // Default export for backwards compatibility
  redisClient,
  initRedis,
  RATE_LIMITS
};