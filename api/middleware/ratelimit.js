const redis = require("redis");

// Configuration
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || "6379",
  url: `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`
};

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

const IP_RATE_LIMIT = {
  tokenMax: 10,
  windowMs: 60 * 1000,
  tokensPerWindow: 10
};

// Redis client setup
const redisClient = redis.createClient({ url: REDIS_CONFIG.url });

// Helper functions
const logRedisEvent = (event, message) => {
  console.log(`Redis ${event}: ${message}`);
};

const logRateLimitCheck = (userType, userId, tokenCount, lastWindow, currentWindow) => {
  console.log(
    `Rate limit check for ${userType}:${userId} - ` +
    `Current: ${tokenCount}, Window: ${lastWindow}, Now Window: ${currentWindow}`
  );
};

const extractUserIdentifier = (req) => {
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
};

const getUserContext = (req) => {
  if (req.user && req.user.userId) {
    return {
      userId: req.user.userId,
      userRole: req.user.role,
      limits: RATE_LIMITS[req.user.role] || RATE_LIMITS.student
    };
  }
  
  const userId = extractUserIdentifier(req);
  return {
    userId,
    userRole: 'anonymous',
    limits: RATE_LIMITS.anonymous
  };
};

const calculateWindowStart = (timestamp, windowMs) => {
  return Math.floor(timestamp / windowMs) * windowMs;
};

const parseTokenBucketData = (bucketData, tokenMax, windowStart) => {
  const tokenCount = bucketData.tokenCount ? parseFloat(bucketData.tokenCount) : tokenMax;
  const lastWindow = bucketData.lastWindow ? parseInt(bucketData.lastWindow) : windowStart;
  
  return { tokenCount, lastWindow };
};

const shouldResetWindow = (lastWindow, currentWindowStart) => {
  return lastWindow < currentWindowStart;
};

const updateTokenBucket = async (key, tokenCount, lastWindow, windowMs) => {
  await redisClient.hSet(key, {
    tokenCount: tokenCount.toString(),
    lastWindow: lastWindow.toString(),
  });
  
  // Set expiration to prevent key buildup
  await redisClient.expire(key, Math.ceil(windowMs / 1000) + 10);
};

const buildRateLimitHeaders = (tokensPerWindow, remainingTokens, resetTime, userRole = null) => {
  const headers = {
    'X-RateLimit-Limit': tokensPerWindow.toString(),
    'X-RateLimit-Remaining': Math.floor(remainingTokens).toString(),
    'X-RateLimit-Reset': resetTime.toString()
  };
  
  if (userRole) {
    headers['X-RateLimit-User-Type'] = userRole;
  }
  
  return headers;
};

const buildRetryHeaders = (tokensPerWindow, resetTime, retryAfterSeconds, userRole = null) => {
  const headers = {
    ...buildRateLimitHeaders(tokensPerWindow, 0, resetTime, userRole),
    'Retry-After': retryAfterSeconds.toString()
  };
  
  return headers;
};

const sendRateLimitExceededResponse = (res, retryAfterSeconds, userRole, tokensPerWindow) => {
  const response = {
    error: 'Too many requests',
    retryAfter: retryAfterSeconds
  };
  
  if (userRole) {
    response.userType = userRole;
    response.limit = tokensPerWindow;
  }
  
  return res.status(429).json(response);
};

const handleRedisError = (error, operation, next) => {
  console.error(`Redis operation failed during ${operation}:`, error);
  console.warn('Rate limiting disabled due to Redis error');
  next();
};

const handleGeneralError = (error, operation, next) => {
  console.error(`${operation} error:`, error);
  next();
};

const processRateLimit = async (key, limits, userRole, userId, res, next) => {
  const { tokenMax, windowMs, tokensPerWindow } = limits;
  const now = Date.now();
  const windowStart = calculateWindowStart(now, windowMs);

  try {
    // Get current bucket data atomically
    const bucketData = await redisClient.hGetAll(key);
    let { tokenCount, lastWindow } = parseTokenBucketData(bucketData, tokenMax, windowStart);

    logRateLimitCheck(userRole, userId, tokenCount, lastWindow, windowStart);

    // Reset tokens if we're in a new window
    if (shouldResetWindow(lastWindow, windowStart)) {
      tokenCount = tokenMax;
      lastWindow = windowStart;
      console.log(`New window detected, resetting to ${tokenMax} tokens`);
    }

    const resetTime = Math.ceil((windowStart + windowMs) / 1000);

    if (tokenCount >= 1) {
      // Allow request and decrement token count
      tokenCount -= 1;
      await updateTokenBucket(key, tokenCount, lastWindow, windowMs);
      
      console.log(`Request allowed, tokens remaining: ${tokenCount}`);
      
      // Set success headers
      const headers = buildRateLimitHeaders(tokensPerWindow, tokenCount, resetTime, userRole);
      res.set(headers);
      
      next();
    } else {
      // Rate limit exceeded
      console.log(`Rate limit exceeded for ${userRole}:${userId}`);
      
      const retryAfterSeconds = Math.ceil((windowStart + windowMs - now) / 1000);
      const headers = buildRetryHeaders(tokensPerWindow, resetTime, retryAfterSeconds, userRole);
      res.set(headers);
      
      return sendRateLimitExceededResponse(res, retryAfterSeconds, userRole, tokensPerWindow);
    }
  } catch (redisError) {
    handleRedisError(redisError, 'rate limit processing', next);
  }
};

// Redis connection initialization
async function initRedis() {
  try {
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logRedisEvent('Connection', 'Connected to Redis');
    });

    await redisClient.connect();
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
}

// Main rate limiting middlewares
async function userBasedRateLimit(req, res, next) {
  try {
    const { userId, userRole, limits } = getUserContext(req);
    const key = `rate_limit:${userRole}:${userId}`;
    
    await processRateLimit(key, limits, userRole, userId, res, next);
  } catch (error) {
    handleGeneralError(error, 'User-based rate limiting', next);
  }
}

async function ipBasedRateLimit(req, res, next) {
  try {
    const userIp = extractUserIdentifier(req);
    const key = `rate_limit:ip:${userIp}`;
    const limits = IP_RATE_LIMIT;
    const now = Date.now();
    const windowStart = calculateWindowStart(now, limits.windowMs);

    try {
      const bucketData = await redisClient.hGetAll(key);
      let { tokenCount, lastWindow } = parseTokenBucketData(bucketData, limits.tokenMax, windowStart);

      // Reset tokens if we're in a new window
      if (shouldResetWindow(lastWindow, windowStart)) {
        tokenCount = limits.tokenMax;
        lastWindow = windowStart;
      }

      const resetTime = Math.ceil((windowStart + limits.windowMs) / 1000);

      if (tokenCount >= 1) {
        // Allow request
        tokenCount -= 1;
        await updateTokenBucket(key, tokenCount, lastWindow, limits.windowMs);
        
        const headers = buildRateLimitHeaders(limits.tokensPerWindow, tokenCount, resetTime);
        res.set(headers);
        
        next();
      } else {
        // Rate limit exceeded
        const retryAfterSeconds = Math.ceil((windowStart + limits.windowMs - now) / 1000);
        const headers = buildRetryHeaders(limits.tokensPerWindow, resetTime, retryAfterSeconds);
        res.set(headers);
        
        return sendRateLimitExceededResponse(res, retryAfterSeconds);
      }
    } catch (redisError) {
      handleRedisError(redisError, 'IP rate limiting', next);
    }
  } catch (error) {
    handleGeneralError(error, 'IP-based rate limiting', next);
  }
}

// Graceful shutdown
const setupGracefulShutdown = () => {
  process.on('SIGINT', async () => {
    console.log('Closing Redis connection...');
    await redisClient.quit();
    process.exit(0);
  });
};

// Initialize graceful shutdown
setupGracefulShutdown();

module.exports = {
  userBasedRateLimit,
  ipBasedRateLimit,
  rateLimit: userBasedRateLimit, // Default export for backwards compatibility
  redisClient,
  initRedis,
  RATE_LIMITS
};