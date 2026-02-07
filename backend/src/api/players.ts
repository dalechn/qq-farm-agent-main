// backend/src/api/players.ts

import { Router } from 'express';
import prisma from '../utils/prisma';
import { redisClient, KEY_GLOBAL_LOGS, KEY_PLAYER_LOGS_PREFIX } from '../utils/redis';
import { GameService } from '../services/GameService';
import { authenticateApiKey } from '../middleware/auth';

const router: Router = Router();

// ================= 系统相关 =================

// 获取日志 (支持 ?playerId=xxx 筛选，以及分页 ?page=1&limit=50)
router.get('/logs', async (req, res) => {
  const playerId = req.query.playerId as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  // 计算 Redis zRange 的索引范围
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  try {
    let logsRaw;
    let total = 0;

    if (playerId) {
      const playerKey = `${KEY_PLAYER_LOGS_PREFIX}${playerId}`;
      total = await redisClient.zCard(playerKey);
      // REV: true 表示从最新的开始拿 (降序)
      logsRaw = await redisClient.zRange(playerKey, start, end, { REV: true });
    } else {
      total = await redisClient.zCard(KEY_GLOBAL_LOGS);
      logsRaw = await redisClient.zRange(KEY_GLOBAL_LOGS, start, end, { REV: true });
    }

    const logs = logsRaw.map(log => JSON.parse(log));

    // 返回标准分页结构
    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total,
        hasMore: end < total - 1 // 如果当前结束索引小于总数-1，说明后面还有
      }
    });
  } catch (error) {
    console.error('Fetch logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

router.get('/notifications', authenticateApiKey, async (req: any, res) => {
  const notifications = await prisma.notification.findMany({
    where: { playerId: req.playerId },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  res.json(notifications);
});

router.post('/notifications/read', authenticateApiKey, async (req: any, res) => {
  const { ids } = req.body;
  await prisma.notification.updateMany({
    where: { id: { in: ids }, playerId: req.playerId },
    data: { read: true }
  });
  res.json({ success: true });
});

export default router;