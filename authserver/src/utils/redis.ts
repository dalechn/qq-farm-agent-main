import { createClient, type RedisClientType } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// 1. 通用客户端
const redisClient: RedisClientType = createClient({
  url: redisUrl
});

// 2. 订阅专用客户端
const redisSubscriber: RedisClientType = redisClient.duplicate();

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisSubscriber.on('error', (err) => console.error('Redis Subscriber Error', err));

export const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log('✅ Connected to Redis (Publisher)');
  }

  if (!redisSubscriber.isOpen) {
    await redisSubscriber.connect();
    console.log('✅ Connected to Redis (Subscriber)');
  }
};


export { redisClient, redisSubscriber };
export default redisClient;


// ==================== 社交关注 Key 配置 (Social Dedicated) ====================
export const SOCIAL_KEYS = {
  FOLLOWING: 'social:v2:following:',  // ZSET: score=ts, value=playerId
  FOLLOWERS: 'social:v2:followers:',  // ZSET: score=ts, value=playerId
  MQ_EVENTS: 'mq:social:events',      // Stream Key
  GROUP_NAME: 'group:social:sync',    // Consumer Group (Social Specific)
  CONSUMER_NAME: `consumer:social:${process.env.HOSTNAME || 'worker-1'}`
};