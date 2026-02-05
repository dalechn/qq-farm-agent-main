// 社交相关 API

import { Router } from 'express';
import prisma from '../utils/prisma';
import { FollowService } from '../services/FollowService';
import { authenticateApiKey } from '../middleware/auth';
import { broadcast } from '../utils/websocket';

const router: Router = Router();

router.post('/follow', authenticateApiKey, async (req: any, res) => {
  const { targetId } = req.body;
  try {
    const result = await FollowService.follow(req.playerId, targetId);
    
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    const target = await prisma.player.findUnique({ where: { id: targetId }, select: { name: true } });
    
    broadcast({
      type: 'action',
      action: 'FOLLOW',
      playerId: req.playerId,
      playerName: player?.name,
      details: `关注了 ${target?.name}${result.isMutual ? ' (互相关注)' : ''}`
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/unfollow', authenticateApiKey, async (req: any, res) => {
  const { targetId } = req.body;
  try {
    const result = await FollowService.unfollow(req.playerId, targetId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/following', authenticateApiKey, async (req: any, res) => {
  try {
    const following = await FollowService.getFollowing(req.playerId);
    res.json(following);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/followers', authenticateApiKey, async (req: any, res) => {
  try {
    const followers = await FollowService.getFollowers(req.playerId);
    res.json(followers);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/friends', authenticateApiKey, async (req: any, res) => {
  try {
    const friends = await FollowService.getFriends(req.playerId);
    res.json(friends);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/friends/:friendId/farm', authenticateApiKey, async (req: any, res) => {
  try {
    const farm = await FollowService.getFriendFarm(req.playerId, req.params.friendId);
    res.json(farm);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/steal', authenticateApiKey, async (req: any, res) => {
  const { victimId, position } = req.body;
  try {
    const result = await FollowService.stealCrop(req.playerId, victimId, position);
    
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    const victim = await prisma.player.findUnique({ where: { id: victimId }, select: { name: true } });
    
    broadcast({
      type: 'action',
      action: 'STEAL',
      playerId: req.playerId,
      playerName: player?.name,
      details: `从${victim?.name}偷走${result.stolen.cropName}`
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/steal/history', authenticateApiKey, async (req: any, res) => {
  const type = (req.query.type as 'stolen' | 'stealer') || 'stealer';
  try {
    const history = await FollowService.getStealHistory(req.playerId, type);
    res.json(history);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;