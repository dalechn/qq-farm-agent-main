import { Router } from 'express';
import prisma from '../utils/prisma';
import { redisClient } from '../utils/redis';
import { authenticateApiKey } from '../middleware/auth';
import { KEY_GLOBAL_LOGS, KEY_PLAYER_LOGS_PREFIX } from '../config/redis-keys';

const router: Router = Router();

// [修改] Key 定义已迁移到 config/redis-keys.ts

// 获取日志 (支持 ?playerId=xxx 筛选)
router.get('/logs', async (req, res) => {
  const playerId = req.query.playerId as string;
  const limit = 100;

  try {
    let logsRaw;
    if (playerId) {
      // [修改] 使用新的 Key 读取玩家日志
      const playerKey = `${KEY_PLAYER_LOGS_PREFIX}${playerId}`;
      logsRaw = await redisClient.zRange(playerKey, 0, limit - 1, { REV: true });
    } else {
      // [修改] 使用新的 Key 读取全局日志
      logsRaw = await redisClient.zRange(KEY_GLOBAL_LOGS, 0, limit - 1, { REV: true });
    }

    const logs = logsRaw.map(log => JSON.parse(log));
    res.json(logs);
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