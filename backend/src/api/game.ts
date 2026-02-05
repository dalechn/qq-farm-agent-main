// backend/src/api/game.ts

import { Router } from 'express';
import prisma from '../utils/prisma';
import { GameService } from '../services/GameService';
import { FollowService } from '../services/FollowService'; // [新增] 引入 FollowService
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

// 照料 (浇水/除草/杀虫) - [修改] 增加好友检查
router.post('/care', authenticateApiKey, async (req: any, res) => {
    const { position, type, targetId } = req.body; 
    
    const ownerId = targetId || req.playerId;
    const isHelpingFriend = ownerId !== req.playerId;

    try {
        // [新增] 权限检查：如果不是自己，必须是互相关注的好友
        if (isHelpingFriend) {
            const isFriend = await FollowService.checkMutualFollow(req.playerId, ownerId);
            if (!isFriend) {
                return res.status(403).json({ error: '只能帮好友（互相关注）照料作物哦' });
            }
        }

        const result = await GameService.care(req.playerId, ownerId, position, type);

        const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
        
        let targetName = '自己';
        if (isHelpingFriend) {
            const targetPlayer = await prisma.player.findUnique({ where: { id: ownerId }, select: { name: true } });
            targetName = targetPlayer?.name || '好友';
        }

        let actionName = '照料';
        if (type === 'water') actionName = '浇水';
        if (type === 'weed') actionName = '除草';
        if (type === 'pest') actionName = '除虫';

        const details = isHelpingFriend
            ? `去 ${targetName} 的农场帮忙${actionName}，获得 +${result.exp}EXP`
            : `进行了${actionName} +${result.exp}EXP`;

        broadcast({
            type: 'action',
            action: 'CARE',
            playerId: req.playerId,
            playerName: player?.name,
            details: details
        });

        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// 铲除枯萎作物 - [修改] 增加好友检查
router.post('/shovel', authenticateApiKey, async (req: any, res) => {
    const { position, targetId } = req.body;
    
    const ownerId = targetId || req.playerId;
    const isHelpingFriend = ownerId !== req.playerId;

    try {
        // [新增] 权限检查：如果不是自己，必须是互相关注的好友
        if (isHelpingFriend) {
            const isFriend = await FollowService.checkMutualFollow(req.playerId, ownerId);
            if (!isFriend) {
                return res.status(403).json({ error: '只能帮好友（互相关注）铲除作物哦' });
            }
        }

        const result = await GameService.shovel(req.playerId, ownerId, position);

        const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
        
        let targetName = '自己';
        if (isHelpingFriend) {
            const targetPlayer = await prisma.player.findUnique({ where: { id: ownerId }, select: { name: true } });
            targetName = targetPlayer?.name || '好友';
        }

        const details = isHelpingFriend
            ? `帮忙铲除了 ${targetName} 的枯萎作物，获得 +${result.exp}EXP`
            : `铲除了枯萎作物 +${result.exp}EXP`;

        broadcast({
            type: 'action',
            action: 'SHOVEL',
            playerId: req.playerId,
            playerName: player?.name,
            details: details
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
    
    let details = `收获 +${reward.gold}金币`;
    if (reward.penalty && reward.penalty > 0) details += ` (因灾害损失-${reward.penalty})`;
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
        details: `扩建了第 ${result.newPosition + 1} 块土地`
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
        details: `升级了土地 (位置 ${req.body.position})`
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

export default router;