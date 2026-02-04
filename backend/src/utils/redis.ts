import { createClient, type RedisClientType } from 'redis';

// 显式标注类型为 RedisClientType
const redisClient: RedisClientType = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

export const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log('✅ Connected to Redis');
  }
};

export default redisClient;