// backend/src/api/game.ts

import { Router } from 'express';
import prisma from '../utils/prisma';
import { GameService } from '../services/GameService';
import { authenticateApiKey } from '../middleware/auth';
import { broadcast } from '../utils/websocket';

const router: Router = Router();

// 获取作物列表
router.get('/crops', async (req, res) => {
  const crops = await prisma.crop.findMany();
  res.json(crops);
});

// 种植 (只能种自己的)
router.post('/plant', authenticateApiKey, async (req: any, res) => {
  const { position, cropType } = req.body;

  try {
    // 查询玩家名字（避免 Worker 重复查询）
    const player = await prisma.player.findUnique({
      where: { id: req.playerId },
      select: { name: true }
    });

    const result = await GameService.plant(
      req.playerId,
      player?.name || 'Unknown',
      position,
      cropType
    );

    // 种植事件由 Worker 统一广播
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 照料 (浇水/除草/杀虫)
router.post('/care', authenticateApiKey, async (req: any, res) => {
    const { position, type, targetId } = req.body;

    const operatorId = req.playerId;
    const ownerId = targetId || req.playerId;

    try {
        // 查询操作者和土地所有者的名字（避免 Worker 重复查询）
        const [operator, owner] = await Promise.all([
            prisma.player.findUnique({ where: { id: operatorId }, select: { name: true } }),
            prisma.player.findUnique({ where: { id: ownerId }, select: { name: true } })
        ]);

        const result = await GameService.care(
            operatorId,
            operator?.name || 'Unknown',
            ownerId,
            owner?.name || 'Unknown',
            position,
            type
        );

        // 照料事件由 Worker 统一广播
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// 铲除枯萎作物
router.post('/shovel', authenticateApiKey, async (req: any, res) => {
    const { position, targetId } = req.body;

    const operatorId = req.playerId;
    const ownerId = targetId || req.playerId;

    try {
        // 查询操作者和土地所有者的名字（避免 Worker 重复查询）
        const [operator, owner] = await Promise.all([
            prisma.player.findUnique({ where: { id: operatorId }, select: { name: true } }),
            prisma.player.findUnique({ where: { id: ownerId }, select: { name: true } })
        ]);

        const result = await GameService.shovel(
            operatorId,
            operator?.name || 'Unknown',
            ownerId,
            owner?.name || 'Unknown',
            position
        );

        // 铲除事件由 Worker 统一广播
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// 收获
router.post('/harvest', authenticateApiKey, async (req: any, res) => {
  const { position } = req.body;

  try {
    // 查询玩家名字（避免 Worker 重复查询）
    const player = await prisma.player.findUnique({
      where: { id: req.playerId },
      select: { name: true }
    });

    const reward = await GameService.harvest(
      req.playerId,
      player?.name || 'Unknown',
      position
    );

    // 收获事件由 Worker 统一广播
    res.json({ success: true, reward });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 扩建土地
router.post('/land/expand', authenticateApiKey, async (req: any, res) => {
  try {
    const result = await GameService.expandLand(req.playerId);
    
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    broadcast({
        type: 'action',
        action: 'EXPAND',
        playerId: req.playerId,
        playerName: player?.name,
        details: `Expanded to land #${result.newPosition + 1}`
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 升级土地
router.post('/land/upgrade', authenticateApiKey, async (req: any, res) => {
  try {
    const result = await GameService.upgradeLand(req.playerId, req.body.position);
    
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    broadcast({
        type: 'action',
        action: 'UPGRADE',
        playerId: req.playerId,
        playerName: player?.name,
        details: `Upgraded land (position ${req.body.position})`
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 使用化肥
router.post('/item/fertilizer', authenticateApiKey, async (req: any, res) => {
  try {
    const { position, type } = req.body;
    const result = await GameService.useFertilizer(req.playerId, position, type);
    
    broadcast({
      type: 'action',
      action: 'FERTILIZE',
      playerId: req.playerId,
      position,
      newMatureAt: result.newMatureAt
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// [新增] 购买看守狗
router.post('/dog/buy', authenticateApiKey, async (req: any, res) => {
  try {
    const result = await GameService.buyDog(req.playerId);
    
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    broadcast({
        type: 'action',
        action: 'BUY_DOG',
        playerId: req.playerId,
        playerName: player?.name,
        details: `Adopted a watchdog`
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// [新增] 喂狗
router.post('/dog/feed', authenticateApiKey, async (req: any, res) => {
  try {
    const result = await GameService.feedDog(req.playerId);
    
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    broadcast({
      type: 'action',
      action: 'FEED_DOG',
      playerId: req.playerId,
      playerName: player?.name,
      details: `Fed the dog`
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 偷菜
router.post('/steal', authenticateApiKey, async (req: any, res) => {
  const { victimId, position } = req.body;
  const stealerId = req.playerId;

  // 不能偷自己的菜
  if (stealerId === victimId) {
    return res.status(400).json({ error: 'Cannot steal from yourself' });
  }

  try {
    const result = await GameService.stealCrop(stealerId, victimId, position);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;