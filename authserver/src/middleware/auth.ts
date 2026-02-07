import { Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import redisClient from '../utils/redis';

export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.header('X-API-KEY');

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API Key' });
  }

  try {
    // 1. 尝试从 Redis 获取玩家 ID
    const cacheKey = `apikey:${apiKey}`;
    let playerId = await redisClient.get(cacheKey);

    if (!playerId) {
      // 2. 如果 Redis 没有，从数据库查
      const player = await prisma.player.findUnique({
        where: { apiKey },
        select: { id: true }
      });

      if (!player) {
        return res.status(403).json({ error: 'Invalid API Key' });
      }

      playerId = player.id;
      // 3. 存入 Redis，设置 1 小时过期
      await redisClient.set(cacheKey, playerId, { EX: 3600 });
    }

    // 将玩家 ID 存入请求对象
    (req as any).playerId = playerId;

    // [新增] ⚡️ 更新“最新活动”排行榜 (Fire-and-forget)
    // 记录当前时间戳，用于 sort=active
    // updateLeaderboard('active', playerId, Date.now()).catch((err) => {
    //   console.error('Failed to update active leaderboard', err);
    // });

    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};