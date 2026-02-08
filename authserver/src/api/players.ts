// backend/src/api/players.ts

import { Router } from 'express';
import prisma from '../utils/prisma';
import { redisClient, SOCIAL_KEYS } from '../utils/redis';
import { authenticateApiKey } from '../middleware/auth';

const router: Router = Router();

// ================= 系统相关 =================

router.post('/player', async (req: any, res: any) => {
  const { name, twitter } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const existing = await prisma.player.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: 'Name already taken' });
    }

    const avatar = `https://robohash.org/${encodeURIComponent(name)}.png?set=set1`;

    // ❌ [删除] 不再需要在 Auth Server 这里生成初始土地数据
    // const initialLandCount = GAME_CONFIG.LAND.INITIAL_COUNT;
    // const initialLands = ...

    // ✅ [修改] 直接创建，依赖数据库默认值
    const player = await prisma.player.create({
      data: {
        name,
        avatar,
        twitter,
        // lands: initialLands // ❌ [删除] 这一行
        // lands 字段会自动使用 schema.prisma 中的 @default("[]")
        // landCount 字段会自动使用 @default(6)
      }
    });

    console.log(`[Auth] New player registered: ${player.name} (${player.id})`);
    res.status(201).json(player);

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create player' });
  }
});


// [新增] 获取社交统计 (不需要认证)
router.get('/stats', async (req: any, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId query parameter" });
  }

  try {
    // Get counts from Redis ZSETs and player info in parallel
    const followingKey = `${SOCIAL_KEYS.FOLLOWING}${userId}`;
    const followersKey = `${SOCIAL_KEYS.FOLLOWERS}${userId}`;

    const [followingCount, followersCount, player] = await Promise.all([
      redisClient.zCard(followingKey),
      redisClient.zCard(followersKey),
      prisma.player.findUnique({
        where: { id: userId as string },
        select: {
          name: true,
          avatar: true,
          twitter: true,
          createdAt: true
        }
      })
    ]);

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    res.json({
      followers: followersCount,
      following: followingCount,
      avatar: player.avatar || `https://robohash.org/${encodeURIComponent(player.name)}.png?set=set1`,
      twitter: player.twitter || '',
      createdAt: player.createdAt.toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/search', async (req: any, res) => {
  const { name } = req.query;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name parameter is required' });
  }

  try {
    // 使用 findUnique 进行精确匹配 (schema 中 name 是 @unique)
    const player = await prisma.player.findUnique({
      where: { name },
      select: {
        id: true,
        name: true,
        avatar: true,
      }
    });

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(player);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
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