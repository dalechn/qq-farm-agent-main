// backend/src/api/players.ts

import { Router } from 'express';
import prisma from '../utils/prisma';
import { redisClient } from '../utils/redis';
import { authenticateApiKey } from '../middleware/auth';

const router: Router = Router();

// ================= 系统相关 =================



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