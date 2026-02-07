// backend/src/api/game.ts

import { Router } from 'express';
import { GameService } from '../services/GameService';
import { authenticateApiKey } from '../middleware/auth';
import { CROPS } from '../utils/game-keys';
import { redisClient, KEYS } from '../utils/redis';
import prisma from '../utils/prisma';

const router: Router = Router();

// ==========================================
// 1. 玩家查询接口 (优先 Redis)
// ==========================================

// 获取当前玩家状态
router.get('/me', authenticateApiKey, async (req: any, res) => {
  try {
    const player = await GameService.getPlayerState(req.playerId);

    // 补充 DB 数据
    const counts = await prisma.player.findUnique({
      where: { id: req.playerId },
      select: { _count: { select: { followers: true, following: true } } }
    });

    if (counts) {
      (player as any)._count = counts._count;
    }

    res.json(player); // player 已经包含了 lands 和 gold
  } catch (error: any) {
    console.error('Get me error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看他人主页
router.get('/users/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);

    const user = await prisma.player.findFirst({
      where: { name: name },
      select: { id: true }
    });

    if (!user) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const player = await GameService.getPlayerState(user.id);

    const counts = await prisma.player.findUnique({
      where: { id: user.id },
      select: { _count: { select: { followers: true, following: true } } }
    });

    if (counts) {
      (player as any)._count = counts._count;
    }

    res.json(player);

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 排行榜
router.get('/players', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  try {
    const [usersFromDb, total] = await prisma.$transaction([
      prisma.player.findMany({
        select: { id: true },
        orderBy: { gold: 'desc' },
        skip,
        take: limit
      }),
      prisma.player.count()
    ]);

    const playersData = await Promise.all(
      usersFromDb.map(async (u) => {
        try {
          const player = await GameService.getPlayerState(u.id);
          // 排行榜列表不需要地块详情，可以剔除以减小体积（可选）
          // const { lands, ...info } = player; return info;
          return player;
        } catch (e) {
          return null;
        }
      })
    );

    const validPlayers = playersData.filter(p => p !== null);

    res.json({
      data: validPlayers,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + usersFromDb.length < total
      }
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// ==========================================
// 2. 基础配置
// ==========================================
router.get('/crops', (req, res) => {
  res.json(CROPS);
});

// ==========================================
// 3. 游戏操作 (全 Redis)
// ==========================================

// 辅助：从 Redis 获取玩家名字 (替代 DB 查询)
async function getPlayerNameFromRedis(playerId: string): Promise<string> {
  const name = await redisClient.hGet(KEYS.PLAYER(playerId), 'name');
  return name || 'Farmer';
}

// 种植
router.post('/plant', authenticateApiKey, async (req: any, res) => {
  const { position, cropType } = req.body;
  try {
    const playerName = await getPlayerNameFromRedis(req.playerId);

    const result = await GameService.plant(
      req.playerId,
      playerName,
      position,
      cropType
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 收获
router.post('/harvest', authenticateApiKey, async (req: any, res) => {
  const { position } = req.body;
  try {
    const result = await GameService.harvest(req.playerId, position);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 偷菜
router.post('/steal', authenticateApiKey, async (req: any, res) => {
  const { victimId, position } = req.body;
  try {
    const result = await GameService.steal(req.playerId, victimId, position);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 照料
router.post('/care', authenticateApiKey, async (req: any, res) => {
  const { position, type, targetId } = req.body;
  try {
    const result = await GameService.care(
      req.playerId,
      targetId || req.playerId,
      position,
      type
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 铲除
router.post('/shovel', authenticateApiKey, async (req: any, res) => {
  const { position, targetId } = req.body;
  try {
    // If targetId is provided, shovel that player's land. Otherwise shovel own land.
    const ownerId = targetId || req.playerId;
    const result = await GameService.shovel(req.playerId, ownerId, position);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 升级土地
router.post('/upgrade-land', authenticateApiKey, async (req: any, res) => {
  const { position } = req.body;
  try {
    const result = await GameService.upgradeLand(req.playerId, position);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 扩建
router.post('/expand', authenticateApiKey, async (req: any, res) => {
  try {
    const result = await GameService.expandLand(req.playerId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 施肥
router.post('/fertilize', authenticateApiKey, async (req: any, res) => {
  const { position, type } = req.body;
  try {
    const result = await GameService.useFertilizer(req.playerId, position, type);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 买狗
router.post('/dog/buy', authenticateApiKey, async (req: any, res) => {
  try {
    const result = await GameService.buyOrFeedDog(req.playerId, false);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 喂狗
router.post('/dog/feed', authenticateApiKey, async (req: any, res) => {
  try {
    const result = await GameService.buyOrFeedDog(req.playerId, true);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;