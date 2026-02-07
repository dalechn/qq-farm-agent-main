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

// ==================== [修改] 排行榜 (ZSET) ====================

// 支持 gold (金币榜), level (等级榜), active (活跃榜)
export const updateLeaderboard = async (type: 'gold' | 'level' | 'active', playerId: string, score: number) => {
  const key = `leaderboard:${type}`;
  await redisClient.zAdd(key, { score, value: playerId });
};

// 支持分页
export const getTopPlayers = async (type: 'gold' | 'level' | 'active', page: number = 1, limit: number = 20) => {
  const key = `leaderboard:${type}`;
  const start = (page - 1) * limit;
  const stop = start + limit - 1;
  return await redisClient.zRangeWithScores(key, start, stop, { REV: true });
};

// 获取排行榜总人数
export const getLeaderboardCount = async (type: 'gold' | 'level' | 'active') => {
  return await redisClient.zCard(`leaderboard:${type}`);
};

// ================= Key 常量定义 =================
export const KEYS = {
  // Hash: 玩家数据 game:player:{id}
  PLAYER: (id: string) => `game:player:${id}`,

  // Hash: 土地数据 game:land:{playerId}:{position}
  LAND: (pid: string, pos: number) => `game:land:${pid}:${pos}`,

  // [原有] Game Stream Key
  MQ_GAME_EVENTS: 'mq:game:events',



  // [新增] Consumer Group 名称 (复用或新建)
  GROUP_NAME_SYNC: 'group:sync',
  CONSUMER_NAME: `consumer:${process.env.HOSTNAME || 'worker-1'}`,

  // Set: 某块地的偷窃者记录 game:land:{pid}:{pos}:thieves
  LAND_THIEVES: (pid: string, pos: number) => `game:land:${pid}:${pos}:thieves`,

  // Daily tracking keys
  DAILY_STEAL: (playerId: string, date?: string) => {
    const today = date || new Date().toISOString().split('T')[0];
    return `daily:steal:${today}:${playerId}`;
  },
  DAILY_EXP: (playerId: string, date?: string) => {
    const today = date || new Date().toISOString().split('T')[0];
    return `daily:exp:${today}:${playerId}`;
  },
};

// ================= 辅助函数 =================

export const parseRedisHash = <T>(data: Record<string, string>): T | null => {
  if (!data || Object.keys(data).length === 0) return null;
  const result: any = { ...data };
  for (const key in result) {
    const val = result[key];
    if (!isNaN(Number(val)) && val !== '') {
      if (key.endsWith('At') && Number(val) > 1000000000) {
      } else {
        result[key] = Number(val);
      }
    }
  }
  return result as T;
};

export const KEY_GLOBAL_LOGS = 'farm:v2:global_logs';
export const KEY_PLAYER_LOGS_PREFIX = 'farm:v2:player_logs:';

// ==================== 社交关注 Key 配置 (Social Dedicated) ====================
export const SOCIAL_KEYS = {
  FOLLOWING: 'social:v2:following:',  // ZSET: score=ts, value=playerId
  FOLLOWERS: 'social:v2:followers:',  // ZSET: score=ts, value=playerId
  MQ_EVENTS: 'mq:social:events',      // Stream Key
  GROUP_NAME: 'group:social:sync',    // Consumer Group (Social Specific)
  CONSUMER_NAME: `consumer:social:${process.env.HOSTNAME || 'worker-1'}`
};