// backend/src/api/game.ts

import { Router } from 'express';
import { GameService } from '../services/GameService';
import { authenticateApiKey } from '../middleware/auth';
import { CROPS } from '../utils/game-keys';
import { redisClient, getTopPlayers, getLeaderboardCount, KEY_GLOBAL_LOGS, KEY_PLAYER_LOGS_PREFIX } from '../utils/redis';
import prisma from '../utils/prisma';

const router: Router = Router();

// ==========================================
// 1. 玩家查询接口 (优先 Redis)
// ==========================================

// 获取当前玩家状态
// 1. 获取当前玩家状态
router.get('/me', authenticateApiKey, async (req: any, res) => {
  try {
    const player = await GameService.getPlayerState(req.playerId);
    res.json(player);
  } catch (error: any) {
    console.error('Get me error:', error.message);

    // [修复] 如果数据库里找不到人，返回 404，而不是 500
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.status(500).json({ error: error.message });
  }
});

// 2. 查看他人主页
router.get('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    // 直接使用 GameService 获取状态，因为 Service 层通常会处理 lookup
    // 如果需要先检查是否存在，可以保留 prisma check，但直接用 ID 查更快
    const player = await GameService.getPlayerState(userId);

    // 如果 Service 返回 null 或者抛错 (取决于你的 Service 实现)
    // 这里假设 GameService 会抛出 "not found" 如果 Redis/DB 都没有
    res.json(player);

  } catch (error: any) {
    console.error('Get user error:', error.message);

    if (error.message.includes('not found') || error.message.includes('Record to update not found')) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.status(500).json({ error: 'Server error' });
  }
});

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

// [修改] 排行榜 - 全 Redis 实现
router.get('/leaderboard', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  // sort 支持: 'gold' (默认) | 'active' | 'level'
  const sort = (req.query.sort as 'gold' | 'active' | 'level') || 'gold';

  try {
    // 1. 从 Redis ZSET 获取 ID 列表
    const topList = await getTopPlayers(sort, page, limit);
    const total = await getLeaderboardCount(sort);

    // topList 是 [{ value: 'playerId', score: 123 }, ...]
    const targetIds = topList.map(item => item.value);

    if (targetIds.length === 0) {
      return res.json({
        data: [],
        pagination: { page, limit, total, totalPages: 0, hasMore: false }
      });
    }

    // 2. 批量获取详细信息
    const playersData = await Promise.all(
      targetIds.map(async (playerId) => {
        try {
          const player = await GameService.getPlayerState(playerId);
          // 优化：排行榜列表不需要显示详细的土地数据，减少网络传输
          // if (player) (player as any).lands = []; 
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
        hasMore: (page * limit) < total
      }
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

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

// ==========================================
// 2. 基础配置
// ==========================================
router.get('/crops', (req, res) => {
  const { GAME_CONFIG } = require('../utils/game-keys');

  res.json({
    crops: CROPS,
    dog: {
      price: GAME_CONFIG.DOG.PRICE,
      foodPrice: GAME_CONFIG.DOG.FOOD_PRICE,
      foodDuration: GAME_CONFIG.DOG.FOOD_DURATION,
      catchRate: GAME_CONFIG.DOG.CATCH_RATE,
      bitePenalty: GAME_CONFIG.DOG.BITE_PENALTY
    },
    fertilizers: [
      {
        type: 'normal',
        name: 'Normal Fertilizer',
        ...GAME_CONFIG.FERTILIZER.normal
      },
      {
        type: 'high',
        name: 'High-Grade Fertilizer',
        ...GAME_CONFIG.FERTILIZER.high
      }
    ]
  });
});

// ==========================================
// 3. 游戏操作 (全 Redis)
// ==========================================

// 种植
router.post('/plant', authenticateApiKey, async (req: any, res) => {
  const { position, cropType } = req.body;
  try {
    const result = await GameService.plant(
      req.playerId,
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