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

// 种植
router.post('/plant', authenticateApiKey, async (req: any, res) => {
  const { position, cropType } = req.body;
  try {
    const result = await GameService.plant(req.playerId, position, cropType);
    
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

// [新增] 照料 (浇水/除草/杀虫)
router.post('/care', authenticateApiKey, async (req: any, res) => {
    const { position, type } = req.body; // type: 'water' | 'weed' | 'pest'
    try {
        const result = await GameService.care(req.playerId, position, type);

        // [新增] 广播照料动作
        const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
        
        let actionName = '照料';
        if (type === 'water') actionName = '浇水';
        if (type === 'weed') actionName = '除草';
        if (type === 'pest') actionName = '除虫';

        broadcast({
            type: 'action',
            action: 'CARE',
            playerId: req.playerId,
            playerName: player?.name,
            details: `进行了${actionName} +${result.exp}EXP`
        });

        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// [新增] 铲除枯萎作物
router.post('/shovel', authenticateApiKey, async (req: any, res) => {
    const { position } = req.body;
    try {
        const result = await GameService.shovel(req.playerId, position);

        // [新增] 广播铲除动作
        const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });

        broadcast({
            type: 'action',
            action: 'SHOVEL',
            playerId: req.playerId,
            playerName: player?.name,
            details: `铲除了枯萎作物 +${result.exp}EXP`
        });

        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// 收获
router.post('/harvest', authenticateApiKey, async (req: any, res) => {
  const { position } = req.body;
  try {
    const reward = await GameService.harvest(req.playerId, position);
    
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    
    // 如果是多季作物，广播略有不同
    let details = `收获 +${reward.gold}金币`;
    if (reward.penalty && reward.penalty > 0) details += ` (因灾害损失-${reward.penalty})`; // 可选：显示具体扣款
    if (reward.nextSeason) details += " (进入下一季)";
    if (reward.isWithered) details += " (作物枯萎)";

    broadcast({
      type: 'action',
      action: 'HARVEST',
      playerId: req.playerId,
      playerName: player?.name,
      details: details
    });
    
    res.json({ success: true, reward });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;