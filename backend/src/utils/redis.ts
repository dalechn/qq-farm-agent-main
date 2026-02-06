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



// ==================== 新增：排行榜 (ZSET) ====================

export const updateLeaderboard = async (type: 'gold' | 'level', playerId: string, score: number) => {
  const key = `leaderboard:${type}`;
  // ZADD leaderboard:gold 1000 "player_id_123"
  await redisClient.zAdd(key, { score, value: playerId });
};

export const getTopPlayers = async (type: 'gold' | 'level', limit: number = 10) => {
  const key = `leaderboard:${type}`;
  // ZREVRANGE: 按分数从高到低排序
  return await redisClient.zRangeWithScores(key, 0, limit - 1, { REV: true });
};

// ================= Key 常量定义 =================
export const KEYS = {
  // Hash: 玩家数据 game:player:{id}
  PLAYER: (id: string) => `game:player:${id}`,
  
  // Hash: 土地数据 game:land:{playerId}:{position}
  LAND: (pid: string, pos: number) => `game:land:${pid}:${pos}`,
  
  // Set: 某块地的偷窃者记录 game:land:{pid}:{pos}:thieves
  LAND_THIEVES: (pid: string, pos: number) => `game:land:${pid}:${pos}:thieves`,
  
  // Set: 脏数据集合 (Worker 监控这些 Key 进行写库)
  DIRTY_PLAYERS: 'dirty:players',
  DIRTY_LANDS: 'dirty:lands',
};

// ================= 辅助函数 =================

/**
 * 将 Redis Hash (Record<string, string>) 转换为带类型的对象
 */
export const parseRedisHash = <T>(data: Record<string, string>): T | null => {
  if (!data || Object.keys(data).length === 0) return null;
  const result: any = { ...data };
  
  // 自动类型转换：数字字符串转数字，日期字符串转对象
  for (const key in result) {
    const val = result[key];
    // 判断是否是数字
    if (!isNaN(Number(val)) && val !== '') {
      // 特殊字段如果是时间戳，转为 Date
      if (key.endsWith('At') && Number(val) > 1000000000) { 
        // 假设大于某数值的数字是时间戳 (简单判断)
        // 实际上建议在 Service 层手动处理 Date，这里只转 Number
        // 为了兼容 Prisma Date 类型，这里我们先保留 String 时间戳，Service 层再转 Date
      } else {
         result[key] = Number(val);
      }
    }
  }
  return result as T;
};



// [修改] 新的 Key 前缀，避开旧数据的类型冲突
export const KEY_GLOBAL_LOGS = 'farm:v2:global_logs';
export const KEY_PLAYER_LOGS_PREFIX = 'farm:v2:player_logs:';

// [新增] 异步任务队列 Key
export const QUEUE_SOCIAL_EVENTS = 'farm:v2:queue:social_events';


// ==================== 社交关注 Key 前缀 ====================
export const KEY_PREFIX_FOLLOWING = 'social:v2:following:'; // 我关注了谁
export const KEY_PREFIX_FOLLOWERS = 'social:v2:followers:'; // 谁关注了我
