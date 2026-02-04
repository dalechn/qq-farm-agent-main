import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import prisma from './prisma';
import { redisClient, redisSubscriber } from './redis';

// 存储玩家连接 (有身份)
const playerConnections = new Map<string, Set<WebSocket>>();
// 存储游客连接 (监控大屏用)
const guestConnections = new Set<WebSocket>();

// 存储 API Key 到玩家 ID 的映射缓存
const apiKeyToPlayerId = new Map<string, string>();

const CHANNEL_NAME = 'farm_global_events';

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // 1. 启动 Redis 订阅，收到消息后转发给所有本地连接的客户端
  redisSubscriber.subscribe(CHANNEL_NAME, (message) => {
    try {
      // 广播给所有玩家
      playerConnections.forEach((connections) => {
        connections.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(message);
        });
      });

      // 广播给所有游客(监控端)
      guestConnections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(message);
      });
    } catch (e) {
      console.error('Redis sub error:', e);
    }
  });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const apiKey = url.searchParams.get('apiKey');
    let playerId: string | null = null;

    // 鉴权逻辑
    if (apiKey) {
      playerId = apiKeyToPlayerId.get(apiKey) || null;
      
      if (!playerId) {
        const player = await prisma.player.findUnique({
          where: { apiKey },
          select: { id: true }
        });
        if (player) {
          playerId = player.id;
          apiKeyToPlayerId.set(apiKey, playerId);
        }
      }
    }

    // 注册连接
    if (playerId) {
      // 玩家连接
      if (!playerConnections.has(playerId)) {
        playerConnections.set(playerId, new Set());
      }
      playerConnections.get(playerId)!.add(ws);
      ws.send(JSON.stringify({ type: 'connected', mode: 'player', playerId }));
      console.log(`🔌 Player ${playerId} connected`);
    } else {
      // 游客/监控连接 (允许无 Key 进入)
      guestConnections.add(ws);
      ws.send(JSON.stringify({ type: 'connected', mode: 'guest' }));
      console.log(`🔌 Guest monitor connected`);
    }

    // 断开处理
    ws.on('close', () => {
      if (playerId) {
        const connections = playerConnections.get(playerId);
        if (connections) {
          connections.delete(ws);
          if (connections.size === 0) playerConnections.delete(playerId);
        }
      } else {
        guestConnections.delete(ws);
      }
    });
  });

  startMatureChecker();
  console.log('🔌 WebSocket server initialized with Redis Pub/Sub');
  return wss;
}

// 修改 broadcast 函数
export async function broadcast(message: object) { // 建议加上 async
  const data = JSON.stringify(message);
  
  try {
    // 1. 持久化存储到 Redis List (头部插入)
    await redisClient.lPush('farm:global_logs', data);
    // 2. 保持列表长度为 100 (保留索引 0 到 99)
    await redisClient.lTrim('farm:global_logs', 0, 99);
  } catch (e) {
    console.error('Failed to save log to Redis:', e);
  }

  // 3. 原有的发布逻辑
  redisClient.publish(CHANNEL_NAME, data);
}

// 单发消息维持原样（或者是也可以走 Redis 定向推送，这里暂保持简单）
export function sendToPlayer(playerId: string, message: object) {
  const connections = playerConnections.get(playerId);
  if (connections) {
    const data = JSON.stringify(message);
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }
}

// ... startMatureChecker 和 notifySteal 保持不变 ...
async function startMatureChecker() {
    // (保留你原有的代码逻辑)
    setInterval(async () => {
        try {
          const now = new Date();
          const matureLands = await prisma.land.findMany({
            where: { status: 'planted', matureAt: { lte: now } },
            include: { player: { select: { id: true, name: true } } }
          });
    
          for (const land of matureLands) {
            await prisma.land.update({ where: { id: land.id }, data: { status: 'harvestable' } });
            
            // 重要：这里使用 broadcast 确保监控端能看到成熟事件
            broadcast({
                type: 'action',
                action: 'MATURE',
                playerId: land.playerId,
                playerName: land.player.name,
                details: `作物成熟了`,
                timestamp: new Date().toISOString()
            });

            // 私发给玩家
            sendToPlayer(land.playerId, {
              type: 'crop_mature',
              position: land.position,
              cropType: land.cropType,
              message: `你的作物成熟了！`
            });
          }
        } catch (error) {
          console.error('Mature checker error:', error);
        }
      }, 5000);
}

export async function notifySteal(victimId: string, stealerName: string, cropName: string, amount: number, position: number) {
    // (保留你原有的代码逻辑)
    // 这里也可以加一个 broadcast 让监控端看到偷菜行为
    await prisma.notification.create({
        data: {
          playerId: victimId,
          type: 'stolen',
          message: `${stealerName} 偷走了你位置 ${position} 的 ${amount} 个 ${cropName}！`,
          data: JSON.stringify({ stealerName, cropName, amount, position })
        }
      });
    
      sendToPlayer(victimId, {
        type: 'crop_stolen',
        stealerName,
        cropName,
        amount,
        position,
        message: `${stealerName} 偷走了你的 ${cropName}！`
      });
}