// backend/src/api/game.ts

import { Router } from 'express';
import { GameService } from '../services/GameService';
import { authenticateApiKey } from '../middleware/auth';
import { CROPS } from '../utils/game-keys';
import { redisClient, KEYS } from '../utils/redis'; // 引入 Redis 客户端直接取 Name
import prisma from '../utils/prisma';

const router: Router = Router();

// ==========================================
// 1. 玩家查询接口 (优先 Redis)
// ==========================================

// 获取当前玩家状态
// 完全走 Redis，不查 DB，不查 Count
router.get('/me', authenticateApiKey, async (req: any, res) => {
  try {
    const state = await GameService.getPlayerState(req.playerId);
    res.json(state);
  } catch (error: any) {
    console.error('Get me error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看他人主页
// 仅保留 Name -> ID 的必要 DB 查询 (因为 Redis 没有 Name 索引)
// 获取到 ID 后，数据全部从 Redis 读取
router.get('/users/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    
    // 1. 极简 DB 查询：只拿 ID
    const user = await prisma.player.findFirst({
      where: { name: name },
      select: { id: true }
    });

    if (!user) {
      res.status(404).json({ error: 'Player not found' });
      return; 
    }

    // 2. 从 Redis 获取热数据 (含 id, name, gold, lands...)
    const playerState = await GameService.getPlayerState(user.id);
    res.json(playerState);

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 排行榜
// DB 负责排序 ID -> Redis 负责提供数据
router.get('/players', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  try {
    // 1. 从 DB 获取排序后的 ID 列表 (只查 ID，速度快)
    const [usersFromDb, total] = await prisma.$transaction([
      prisma.player.findMany({
        select: { id: true },
        orderBy: { gold: 'desc' },
        skip,
        take: limit
      }),
      prisma.player.count()
    ]);

    // 2. 并发从 Redis 拉取这些玩家的实时数据
    // 这样保证了前端看到的金币/经验是 Redis 里的最新值
    const playersData = await Promise.all(
      usersFromDb.map(async (u) => {
        try {
          // 只取 player 基础信息，不需要 lands 详情
          const state = await GameService.getPlayerState(u.id);
          return state.player; 
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
    // 直接从 Redis 拿名字，不再查库
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
  const { position } = req.body;
  try {
    const result = await GameService.shovel(req.playerId, position);
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