
const redis = require("redis");

const redisHost = process.env.REDIS_HOST || "localhost";
const redisPort = process.env.REDIS_PORT || "6379";

const redisClient = redis.createClient({
  url: `redis://${redisHost}:${redisPort}`,
});


async function rateLimit(req, res, next) {
  const tokenMax = 3;
  const accrualRate = 0.0003;
  const userBucket = {
    tokenCount: tokenMax,
    lastRequest: Date.now(),
  };

  const userIp = req.ip;

  let redisUserBucket = await redisClient.hGetAll(userIp);
  if (Object.keys(redisUserBucket).length === 0) {
    await redisClient.hSet(userIp, {
      tokenCount: userBucket.tokenCount.toString(),
      lastRequest: userBucket.lastRequest.toString(),
    });
    redisUserBucket = userBucket;
  } else {
    redisUserBucket.tokenCount = parseFloat(redisUserBucket.tokenCount);
    redisUserBucket.lastRequest = parseInt(redisUserBucket.lastRequest);
  }

  const currentTime = Date.now();
  const accruedTokens = accrualRate * (currentTime - redisUserBucket.lastRequest);
  redisUserBucket.tokenCount = Math.min(redisUserBucket.tokenCount + accruedTokens, tokenMax);

  if (redisUserBucket.tokenCount >= 1) {
    redisUserBucket.tokenCount -= 1;
    redisUserBucket.lastRequest = currentTime;
    await redisClient.hSet(userIp, {
      tokenCount: redisUserBucket.tokenCount.toString(),
      lastRequest: redisUserBucket.lastRequest.toString(),
    });
    next();
  } else {
    return res.status(429).send("TOO MANY REQUESTS\n");
  }
}