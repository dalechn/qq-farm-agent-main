// 游戏核心 API

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

// 种植
router.post('/plant', authenticateApiKey, async (req: any, res) => {
  const { position, cropType } = req.body;
  try {
    const result = await GameService.plant(req.playerId, position, cropType);
    
    // 广播事件
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    const crop = await prisma.crop.findUnique({ where: { type: cropType } });
    
    broadcast({
      type: 'action',
      action: 'PLANT',
      playerId: req.playerId,
      playerName: player?.name,
      details: `种植${crop?.name} 位置[${position}]`
    });
    
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 收获
router.post('/harvest', authenticateApiKey, async (req: any, res) => {
  const { position } = req.body;
  try {
    const reward = await GameService.harvest(req.playerId, position);
    
    // 广播事件
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    
    broadcast({
      type: 'action',
      action: 'HARVEST',
      playerId: req.playerId,
      playerName: player?.name,
      details: `收获 +${reward.gold}金币`
    });
    
    res.json({ success: true, reward });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;