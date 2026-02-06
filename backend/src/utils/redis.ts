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

// ==================== 玩家状态缓存 ====================

/**
 * 生成玩家状态的缓存 Key
 */
export const getPlayerStateKey = (playerId: string) => {
  return `player_state:${playerId}`;
};

/**
 * 清除玩家缓存 (在任何写操作后调用)
 */
export const invalidatePlayerCache = async (playerId: string) => {
  await redisClient.del(getPlayerStateKey(playerId));
};

// ==================== 分布式锁 Key 前缀 ====================

/**
 * 土地操作锁
 */
export const getLandLockKey = (landId: number | string) => {
  return `lock:land:${landId}`;
};

/**
 * 玩家扩建锁
 */
export const getPlayerExpandLockKey = (playerId: string) => {
  return `lock:player_expand:${playerId}`;
};

/**
 * 玩家狗操作锁
 */
export const getPlayerDogLockKey = (playerId: string) => {
  return `lock:player_dog:${playerId}`;
};

export { redisClient, redisSubscriber };
export default redisClient;

// ==================== Redis Key 配置中心 ====================
// 避免多处定义导致不一致

// [修改] 新的 Key 前缀，避开旧数据的类型冲突
export const KEY_GLOBAL_LOGS = 'farm:v2:global_logs';
export const KEY_PLAYER_LOGS_PREFIX = 'farm:v2:player_logs:';

// [新增] 异步任务队列 Key
export const QUEUE_SOCIAL_EVENTS = 'farm:v2:queue:social_events';
export const QUEUE_FARM_EVENTS = 'farm:v2:queue:farm_events';


// ==================== 社交关注 Key 前缀 ====================
export const KEY_PREFIX_FOLLOWING = 'social:v2:following:'; // 我关注了谁
export const KEY_PREFIX_FOLLOWERS = 'social:v2:followers:'; // 谁关注了我

export const KEY_PREFIX_STEAL_DAILY = 'steal:daily:'; // 防刷 key 前缀
export const KEY_PREFIX_CARE_DAILY = 'care:daily:';
export const KEY_PREFIX_SHOVEL = 'shovel:daily:';

/**
 * 生成每日偷菜防刷的 Redis Key
 * 格式: steal:daily:{date}:{stealerId}:{victimId}:{position}
 * 过期时间: 当天剩余秒数
 */
export const getStealDailyKey = (
  stealerId: string,
  victimId: string,
  position: number
) => {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 格式
  return `${KEY_PREFIX_STEAL_DAILY}${today}:${stealerId}:${victimId}:${position}`;
};

/**
 * 检查今日是否已偷过，并原子性标记
 * @returns true=今日已偷过，false=可以偷（未偷过）
 */
export const checkAndMarkStealToday = async (
  stealerId: string,
  victimId: string,
  position: number
): Promise<boolean> => {
  const key = getStealDailyKey(stealerId, victimId, position);

  // SET key "1" NX EX 86400 (24小时过期，明天自动失效)
  // NX: 只有键不存在时才设置
  // EX: 设置过期时间（秒）
  const result = await redisClient.set(key, '1', { NX: true, EX: 86400 });
  return result !== 'OK'; // 'OK' = 设置成功(今日没偷过)，null = 已存在(今日已偷过)
};

/**
 * 重置今日偷菜记录（用于测试或管理员操作）
 */
export const resetStealToday = async (
  stealerId: string,
  victimId: string,
  position: number
) => {
  const key = getStealDailyKey(stealerId, victimId, position);
  await redisClient.del(key);
};

/**
 * 生成每日照料防刷的 Redis Key
 * 格式: care:daily:{date}:{operatorId}:{ownerId}:{position}:{type}
 */
export const getCareDailyKey = (
  operatorId: string,
  ownerId: string,
  position: number,
  type: 'water' | 'weed' | 'pest'
) => {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 格式
  return `${KEY_PREFIX_CARE_DAILY}${today}:${operatorId}:${ownerId}:${position}:${type}`;
};

/**
 * 检查今日是否已照料过，并原子性标记
 * @returns true=今日已照料过，false=可以照料
 */
export const checkAndMarkCareToday = async (
  operatorId: string,
  ownerId: string,
  position: number,
  type: 'water' | 'weed' | 'pest'
): Promise<boolean> => {
  const key = getCareDailyKey(operatorId, ownerId, position, type);
  const result = await redisClient.set(key, '1', { NX: true, EX: 86400 });
  return result !== 'OK'; // 'OK' = 设置成功，null = 已存在
};

/**
 * 重置今日照料记录（用于测试或管理员操作）
 */
export const resetCareToday = async (
  operatorId: string,
  ownerId: string,
  position: number,
  type: 'water' | 'weed' | 'pest'
) => {
  const key = getCareDailyKey(operatorId, ownerId, position, type);
  await redisClient.del(key);
};


/**
 * 生成每日铲除防刷的 Redis Key
 */
export const getShovelDailyKey = (
  operatorId: string,
  ownerId: string,
  position: number
) => {
  const today = new Date().toISOString().split('T')[0];
  return `${KEY_PREFIX_SHOVEL}${today}:${operatorId}:${ownerId}:${position}`;
};

/**
 * 检查今日是否已铲除过，并原子性标记
 */
export const checkAndMarkShovelToday = async (
  operatorId: string,
  ownerId: string,
  position: number
): Promise<boolean> => {
  const key = getShovelDailyKey(operatorId, ownerId, position);
  const result = await redisClient.set(key, '1', { NX: true, EX: 86400 });
  return result !== 'OK';
};

/**
 * 重置今日铲除记录（用于测试或管理员操作）
 */
export const resetShovelToday = async (
  operatorId: string,
  ownerId: string,
  position: number
) => {
  const key = getShovelDailyKey(operatorId, ownerId, position);
  await redisClient.del(key);
};
