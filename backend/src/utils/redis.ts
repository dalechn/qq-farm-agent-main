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

// ==================== 新增：分布式锁 ====================

/**
 * 尝试获取分布式锁
 * @param key 锁的键名
 * @param ttlSeconds 锁的超时时间（秒），防止死锁
 * @returns 是否成功获取锁
 */
export const acquireLock = async (key: string, ttlSeconds: number = 5): Promise<boolean> => {
  // SET key value NX EX ttl
  // NX: 只有键不存在时才设置
  // EX: 设置过期时间
  const result = await redisClient.set(key, '1', { NX: true, EX: ttlSeconds });
  return result === 'OK';
};

/**
 * 释放锁
 */
export const releaseLock = async (key: string): Promise<void> => {
  await redisClient.del(key);
};

// ==================== 新增：排行榜 (ZSET) ====================

/**
 * 更新玩家在排行榜中的分数
 * @param type 排行榜类型 ('gold' | 'level')
 * @param playerId 玩家ID
 * @param score 分数 (金币数或等级)
 */
export const updateLeaderboard = async (type: 'gold' | 'level', playerId: string, score: number) => {
  const key = `leaderboard:${type}`;
  // ZADD leaderboard:gold 1000 "player_id_123"
  await redisClient.zAdd(key, { score, value: playerId });
};

/**
 * 获取排行榜前 N 名
 * @returns 返回数组 [{value: playerId, score: 100}, ...]
 */
export const getTopPlayers = async (type: 'gold' | 'level', limit: number = 10) => {
  const key = `leaderboard:${type}`;
  // ZREVRANGE: 按分数从高到低排序
  return await redisClient.zRangeWithScores(key, 0, limit - 1, { REV: true });
};

export { redisClient, redisSubscriber };
export default redisClient;