// backend/src/api/players.ts

import { Router } from 'express';
import prisma from '../utils/prisma';
import { GameService } from '../services/GameService';
import { authenticateApiKey } from '../middleware/auth';
// 注意：GAME_CONFIG 引用可能不再需要，除非用于其他逻辑

const router: Router = Router();

// 获取当前玩家状态 (Agent 用)
router.get('/me', authenticateApiKey, async (req: any, res) => {
  const state = await GameService.getPlayerState(req.playerId);
  res.json(state);
});

// 根据名字获取玩家信息 (Web 用)
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
  
      const playerState = await GameService.getPlayerState(user.id);
      
      if (!playerState) {
          res.status(404).json({ error: 'Player data unavailable' });
          return;
      }
  
      const counts = await prisma.player.findUnique({
          where: { id: user.id },
          select: { _count: { select: { followers: true, following: true } } }
      });
  
      res.json({
          ...playerState,
          _count: counts?._count
      });
  
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

// [已移除] 注册接口已移动到 auth-server.ts

// 获取玩家排行榜
router.get('/players', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  try {
    const [players, total] = await prisma.$transaction([
      prisma.player.findMany({
        include: { 
          lands: { orderBy: { position: 'asc' } },
          _count: { select: { followers: true, following: true } }
        },
        orderBy: { gold: 'desc' },
        skip,
        take: limit
      }),
      prisma.player.count()
    ]);

    res.json({
      data: players,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + players.length < total
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

export default router;