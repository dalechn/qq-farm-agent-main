// 玩家相关 API

import { Router } from 'express';
import prisma from '../utils/prisma';
import { GameService } from '../services/GameService';
import { authenticateApiKey } from '../middleware/auth';

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
      
      // 1. 先找到玩家 ID
      const user = await prisma.player.findFirst({
        where: { name: name },
        select: { id: true } // 只拿 ID
      });
  
      if (!user) {
        res.status(404).json({ error: 'Player not found' });
        return; 
      }
  
      // 2. [关键] 调用 GameService 获取（并结算）最新状态
      const playerState = await GameService.getPlayerState(user.id);
      
      if (!playerState) {
          res.status(404).json({ error: 'Player data unavailable' });
          return;
      }
  
      // 3. 补充关注数据 (GameService 通常只返回 Player + Lands)
      // 我们需要额外查一下关注数等信息，或者修改 GameService 让它查更多
      // 这里简单补查一下统计数据
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

// 创建玩家
router.post('/player', async (req, res) => {
  const { name, twitter } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const avatar = `https://robohash.org/${encodeURIComponent(name)}.png?set=set1`;

  try {
    const player = await prisma.player.create({
      data: {
        name,
        avatar,
        twitter,
        lands: {
          create: Array.from({ length: 9 }).map((_, i) => ({ position: i }))
        }
      }
    });
    res.status(201).json(player);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create player' });
  }
});

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