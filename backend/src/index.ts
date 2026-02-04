import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { authenticateApiKey } from './middleware/auth';
import { GameService } from './services/GameService';
import { FollowService } from './services/FollowService';
import prisma from './utils/prisma';
import { connectRedis } from './utils/redis';
import { setupWebSocket, broadcast } from './utils/websocket';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ==================== 公开路由 ====================

// 创建玩家
app.post('/api/player', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const player = await prisma.player.create({
      data: {
        name,
        lands: {
          create: Array.from({ length: 9 }).map((_, i) => ({ position: i }))
        }
      }
    });
    
    // 广播新玩家加入
    broadcast({ type: 'player_joined', player: { id: player.id, name: player.name, level: player.level } });
    
    res.status(201).json(player);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create player' });
  }
});

// 获取所有玩家（前端展示用）
app.get('/api/players', async (req, res) => {
  const players = await prisma.player.findMany({
    include: { lands: { orderBy: { position: 'asc' } } },
    orderBy: { level: 'desc' }
  });
  res.json(players);
});

// 获取作物列表
app.get('/api/crops', async (req, res) => {
  const crops = await prisma.crop.findMany();
  res.json(crops);
});

// ==================== 受保护路由：Agent 操作 ====================

// 获取当前玩家状态
app.get('/api/me', authenticateApiKey, async (req: any, res) => {
  const state = await GameService.getPlayerState(req.playerId);
  res.json(state);
});

// 种植作物
app.post('/api/plant', authenticateApiKey, async (req: any, res) => {
  const { position, cropType } = req.body;
  try {
    const result = await GameService.plant(req.playerId, position, cropType);
    
    // 广播种植事件
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    const crop = await prisma.crop.findUnique({ where: { type: cropType } });
    broadcast({
      type: 'action',
      action: 'PLANT',
      playerId: req.playerId,
      playerName: player?.name,
      details: `种植${crop?.name} 位置[${position}]`,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 收获作物
app.post('/api/harvest', authenticateApiKey, async (req: any, res) => {
  const { position } = req.body;
  try {
    const reward = await GameService.harvest(req.playerId, position);
    
    // 广播收获事件
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    broadcast({
      type: 'action',
      action: 'HARVEST',
      playerId: req.playerId,
      playerName: player?.name,
      details: `收获 +${reward.gold}金币`,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, reward });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 获取通知
app.get('/api/notifications', authenticateApiKey, async (req: any, res) => {
  const notifications = await prisma.notification.findMany({
    where: { playerId: req.playerId },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  res.json(notifications);
});

// 标记通知已读
app.post('/api/notifications/read', authenticateApiKey, async (req: any, res) => {
  const { ids } = req.body;
  await prisma.notification.updateMany({
    where: { id: { in: ids }, playerId: req.playerId },
    data: { read: true }
  });
  res.json({ success: true });
});

// ==================== 关注系统路由 (Follower/Following) ====================

// 关注某人
app.post('/api/follow', authenticateApiKey, async (req: any, res) => {
  const { targetId } = req.body;
  try {
    const result = await FollowService.follow(req.playerId, targetId);
    
    // 广播关注事件
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    const target = await prisma.player.findUnique({ where: { id: targetId }, select: { name: true } });
    broadcast({
      type: 'action',
      action: 'FOLLOW',
      playerId: req.playerId,
      playerName: player?.name,
      details: `关注了 ${target?.name}${result.isMutual ? ' (互相关注)' : ''}`,
      timestamp: new Date().toISOString()
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 取消关注
app.post('/api/unfollow', authenticateApiKey, async (req: any, res) => {
  const { targetId } = req.body;
  try {
    const result = await FollowService.unfollow(req.playerId, targetId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 获取我关注的人
app.get('/api/following', authenticateApiKey, async (req: any, res) => {
  try {
    const following = await FollowService.getFollowing(req.playerId);
    res.json(following);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 获取关注我的人
app.get('/api/followers', authenticateApiKey, async (req: any, res) => {
  try {
    const followers = await FollowService.getFollowers(req.playerId);
    res.json(followers);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 获取好友列表（互相关注的人）
app.get('/api/friends', authenticateApiKey, async (req: any, res) => {
  try {
    const friends = await FollowService.getFriends(req.playerId);
    res.json(friends);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 获取好友农场（需要互相关注）
app.get('/api/friends/:friendId/farm', authenticateApiKey, async (req: any, res) => {
  try {
    const farm = await FollowService.getFriendFarm(req.playerId, req.params.friendId);
    res.json(farm);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 偷菜（需要互相关注）
app.post('/api/steal', authenticateApiKey, async (req: any, res) => {
  const { victimId, position } = req.body;
  try {
    const result = await FollowService.stealCrop(req.playerId, victimId, position);
    
    // 广播偷菜事件
    const player = await prisma.player.findUnique({ where: { id: req.playerId }, select: { name: true } });
    const victim = await prisma.player.findUnique({ where: { id: victimId }, select: { name: true } });
    broadcast({
      type: 'action',
      action: 'STEAL',
      playerId: req.playerId,
      playerName: player?.name,
      details: `从${victim?.name}偷走${result.stolen.cropName}`,
      timestamp: new Date().toISOString()
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 获取偷菜记录
app.get('/api/steal/history', authenticateApiKey, async (req: any, res) => {
  const type = (req.query.type as 'stolen' | 'stealer') || 'stealer';
  try {
    const history = await FollowService.getStealHistory(req.playerId, type);
    res.json(history);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== 服务器启动 ====================

const PORT = process.env.PORT || 3001;

async function start() {
  await connectRedis();
  
  // 初始化作物数据（如果不存在）
  const cropCount = await prisma.crop.count();
  if (cropCount === 0) {
    await prisma.crop.createMany({
      data: [
        { type: 'radish', name: '白萝卜', seedPrice: 10, sellPrice: 15, matureTime: 30, exp: 2 },
        { type: 'carrot', name: '胡萝卜', seedPrice: 20, sellPrice: 35, matureTime: 60, exp: 5 },
        { type: 'corn', name: '玉米', seedPrice: 50, sellPrice: 60, matureTime: 120, exp: 10, yield: 2 },
        { type: 'strawberry', name: '草莓', seedPrice: 80, sellPrice: 100, matureTime: 180, exp: 15, yield: 2 },
        { type: 'watermelon', name: '西瓜', seedPrice: 150, sellPrice: 120, matureTime: 300, exp: 25, yield: 3 }
      ]
    });
    console.log('🌱 Default crops initialized');
  }

  // 创建 HTTP 服务器
  const server = createServer(app);
  
  // 设置 WebSocket
  setupWebSocket(server);

  server.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket available at ws://localhost:${PORT}/ws`);
  });
}

start();
