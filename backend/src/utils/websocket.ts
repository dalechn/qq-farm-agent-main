import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import prisma from './prisma';
import { redisClient, redisSubscriber, KEY_GLOBAL_LOGS, KEY_PLAYER_LOGS_PREFIX } from './redis';
import { v4 as uuidv4 } from 'uuid';

const playerConnections = new Map<string, Set<WebSocket>>();
const guestConnections = new Set<WebSocket>();
const apiKeyToPlayerId = new Map<string, string>();

const CHANNEL_NAME = 'farm_global_events';
const LOG_RETENTION_SECONDS = 24 * 60 * 60; // 24小时
const LOG_RETENTION_MS = LOG_RETENTION_SECONDS * 1000;

// [修改] Key 定义已迁移到 utils/redis.ts

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  redisSubscriber.subscribe(CHANNEL_NAME, (message) => {
    try {
      const send = (ws: WebSocket) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(message);
      };
      playerConnections.forEach((connections) => connections.forEach(send));
      guestConnections.forEach(send);
    } catch (e) {
      console.error('Redis sub error:', e);
    }
  });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const apiKey = url.searchParams.get('apiKey');
    let playerId: string | null = null;

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

    if (playerId) {
      if (!playerConnections.has(playerId)) playerConnections.set(playerId, new Set());
      playerConnections.get(playerId)!.add(ws);
      ws.send(JSON.stringify({ type: 'connected', mode: 'player', playerId }));
    } else {
      guestConnections.add(ws);
      ws.send(JSON.stringify({ type: 'connected', mode: 'guest' }));
    }

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

  // startMatureChecker();
  console.log('🔌 WebSocket server initialized');
  return wss;
}

export async function broadcast(message: any, includeGlobal = true) {
  const logEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...message
  };
  const data = JSON.stringify(logEntry);
  const score = Date.now();

  try {
    const pipeline = redisClient.multi();

    // 1. 全局日志（可选）
    if (includeGlobal) {
      pipeline.zAdd(KEY_GLOBAL_LOGS, { score, value: data });
      pipeline.zRemRangeByScore(KEY_GLOBAL_LOGS, '-inf', score - LOG_RETENTION_MS);
      pipeline.expire(KEY_GLOBAL_LOGS, LOG_RETENTION_SECONDS);
    }

    // 2. 玩家日志（始终写入）
    if (message.playerId) {
      const playerKey = `${KEY_PLAYER_LOGS_PREFIX}${message.playerId}`;
      pipeline.zAdd(playerKey, { score, value: data });
      pipeline.zRemRangeByScore(playerKey, '-inf', score - LOG_RETENTION_MS);
      pipeline.expire(playerKey, LOG_RETENTION_SECONDS);
    }

    await pipeline.exec();
  } catch (e) {
    console.error('Failed to save log to Redis:', e);
  }

  redisClient.publish(CHANNEL_NAME, data);
}

// export function sendToPlayer(playerId: string, message: object) {
//   // Ignored
// }

// async function startMatureChecker() {
//   setInterval(async () => {
//     try {
//       const now = new Date();
//       const matureLands = await prisma.land.findMany({
//         where: { status: 'planted', matureAt: { lte: now } },
//         include: { player: { select: { id: true, name: true } } }
//       });

//       for (const land of matureLands) {
//         await prisma.land.update({ where: { id: land.id }, data: { status: 'harvestable' } });
        
//         broadcast({
//             type: 'action',
//             action: 'MATURE',
//             playerId: land.playerId,
//             playerName: land.player.name,
//             details: `作物成熟了`,
//             timestamp: new Date().toISOString()
//         });
//       }
//     } catch (error) {
//       console.error('Mature checker error:', error);
//     }
//   }, 5000);
// }
