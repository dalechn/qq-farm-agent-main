import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import prisma from './prisma';

// 存储玩家 WebSocket 连接
const playerConnections = new Map<string, Set<WebSocket>>();

// 存储 API Key 到玩家 ID 的映射
const apiKeyToPlayerId = new Map<string, string>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    console.log('🔌 New WebSocket connection');

    // 从 URL 参数获取 API Key
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const apiKey = url.searchParams.get('apiKey');

    if (!apiKey) {
      ws.send(JSON.stringify({ type: 'error', message: 'Missing API Key' }));
      ws.close();
      return;
    }

    // 验证 API Key
    let playerId = apiKeyToPlayerId.get(apiKey);
    if (!playerId) {
      const player = await prisma.player.findUnique({
        where: { apiKey },
        select: { id: true }
      });

      if (!player) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid API Key' }));
        ws.close();
        return;
      }

      playerId = player.id;
      apiKeyToPlayerId.set(apiKey, playerId);
    }

    // 注册连接
    if (!playerConnections.has(playerId)) {
      playerConnections.set(playerId, new Set());
    }
    playerConnections.get(playerId)!.add(ws);

    ws.send(JSON.stringify({ type: 'connected', playerId }));
    console.log(`✅ Player ${playerId} connected via WebSocket`);

    // 处理消息
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 Received:', message);

        // 可以在这里处理客户端发来的消息
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    // 处理断开连接
    ws.on('close', () => {
      const connections = playerConnections.get(playerId!);
      if (connections) {
        connections.delete(ws);
        if (connections.size === 0) {
          playerConnections.delete(playerId!);
        }
      }
      console.log(`❌ Player ${playerId} disconnected`);
    });
  });

  // 启动作物成熟检查定时器
  startMatureChecker();

  console.log('🔌 WebSocket server initialized');
  return wss;
}

// 向指定玩家发送消息
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

// 向所有连接的玩家广播消息
export function broadcast(message: object) {
  const data = JSON.stringify(message);
  playerConnections.forEach((connections) => {
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  });
}

// 作物成熟检查器
async function startMatureChecker() {
  setInterval(async () => {
    try {
      const now = new Date();
      
      // 查找所有刚成熟的作物
      const matureLands = await prisma.land.findMany({
        where: {
          status: 'planted',
          matureAt: { lte: now }
        },
        include: {
          player: { select: { id: true, name: true } }
        }
      });

      // 更新状态并发送通知
      for (const land of matureLands) {
        await prisma.land.update({
          where: { id: land.id },
          data: { status: 'harvestable' }
        });

        // 创建通知
        const crop = await prisma.crop.findUnique({ where: { type: land.cropType! } });
        await prisma.notification.create({
          data: {
            playerId: land.playerId,
            type: 'mature',
            message: `你的 ${crop?.name || land.cropType} 已经成熟了！`,
            data: JSON.stringify({ position: land.position, cropType: land.cropType })
          }
        });

        // 发送 WebSocket 通知
        sendToPlayer(land.playerId, {
          type: 'crop_mature',
          position: land.position,
          cropType: land.cropType,
          cropName: crop?.name,
          message: `位置 ${land.position} 的 ${crop?.name} 已成熟！`
        });

        console.log(`🌾 Crop matured: Player ${land.player.name}, Position ${land.position}`);
      }
    } catch (error) {
      console.error('Mature checker error:', error);
    }
  }, 5000); // 每 5 秒检查一次
}

// 发送偷菜通知
export async function notifySteal(victimId: string, stealerName: string, cropName: string, amount: number, position: number) {
  // 创建通知记录
  await prisma.notification.create({
    data: {
      playerId: victimId,
      type: 'stolen',
      message: `${stealerName} 偷走了你位置 ${position} 的 ${amount} 个 ${cropName}！`,
      data: JSON.stringify({ stealerName, cropName, amount, position })
    }
  });

  // 发送 WebSocket 通知
  sendToPlayer(victimId, {
    type: 'crop_stolen',
    stealerName,
    cropName,
    amount,
    position,
    message: `${stealerName} 偷走了你的 ${cropName}！`
  });
}
