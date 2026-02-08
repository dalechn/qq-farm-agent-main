
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import prisma from './prisma';
import {
  redisClient,
  redisSubscriber,
  KEY_GLOBAL_LOGS,
  KEY_PLAYER_LOGS_PREFIX
} from './redis';
import { logQueue } from './queue'; // [新增] 导入日志队列
import { v4 as uuidv4 } from 'uuid';

const playerConnections = new Map<string, Set<WebSocket>>();
const guestConnections = new Set<WebSocket>();
const apiKeyToPlayerId = new Map<string, string>();

const CHANNEL_NAME = 'farm_global_events';

// [配置] 日志保留策略
const LOG_RETENTION_SECONDS = 24 * 60 * 60; // 时间限制：24小时
const LOG_RETENTION_MS = LOG_RETENTION_SECONDS * 1000;

const MAX_GLOBAL_LOGS = 1000;  // 数量限制：全局日志只保留最新 1000 条
const MAX_PLAYER_LOGS = 200;   // 数量限制：玩家日志只保留最新 200 条

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // 订阅 Redis 频道，支持多实例广播
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

    // 1. 鉴权
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

    // 2. 连接管理
    if (playerId) {
      if (!playerConnections.has(playerId)) playerConnections.set(playerId, new Set());
      playerConnections.get(playerId)!.add(ws);
      ws.send(JSON.stringify({ type: 'connected', mode: 'player', playerId }));
    } else {
      guestConnections.add(ws);
      ws.send(JSON.stringify({ type: 'connected', mode: 'guest' }));
    }

    // 3. 断开清理
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

  console.log('🔌 WebSocket server initialized');
  return wss;
}

/**
 * 广播消息并记录日志
 * 1. 写入 Redis ZSET (实时展示，带时间+数量双重限制)
 * 2. 发送到 BullMQ (异步批量写入 DB)
 * 3. 通过 WebSocket 推送给前端
 */
export async function broadcast(message: any, includeGlobal = true) {
  // [关键] logEntry 是扁平化的结构，包含了 action, details(string), data(object) 等
  const logEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...message
  };
  const data = JSON.stringify(logEntry);
  const score = Date.now();

  try {
    const pipeline = redisClient.multi();

    // ------------------------------------------
    // 1. 全局日志 (Redis ZSET)
    // ------------------------------------------
    if (includeGlobal) {
      pipeline.zAdd(KEY_GLOBAL_LOGS, { score, value: data });

      // A. 时间限制：删除 24 小时前的
      pipeline.zRemRangeByScore(KEY_GLOBAL_LOGS, '-inf', score - LOG_RETENTION_MS);

      // B. 数量限制：只保留最新的 MAX_GLOBAL_LOGS 条
      // 删除 rank 0 到 -(MAX + 1) 的元素
      // 例如保留 1000 条，就删除 0 到 -1001
      pipeline.zRemRangeByRank(KEY_GLOBAL_LOGS, 0, -(MAX_GLOBAL_LOGS + 1));

      pipeline.expire(KEY_GLOBAL_LOGS, LOG_RETENTION_SECONDS);
    }

    // ------------------------------------------
    // 2. 玩家个人日志 (Redis ZSET)
    // ------------------------------------------
    if (message.playerId) {
      const playerKey = `${KEY_PLAYER_LOGS_PREFIX}${message.playerId}`;
      pipeline.zAdd(playerKey, { score, value: data });

      // A. 时间限制
      pipeline.zRemRangeByScore(playerKey, '-inf', score - LOG_RETENTION_MS);

      // B. 数量限制
      pipeline.zRemRangeByRank(playerKey, 0, -(MAX_PLAYER_LOGS + 1));

      pipeline.expire(playerKey, LOG_RETENTION_SECONDS);
    }

    // 执行 Redis 管道
    await pipeline.exec();

    // ------------------------------------------
    // 3. 永久存储 (BullMQ -> Worker -> Postgres/ClickHouse)
    // ------------------------------------------
    // [修复] 直接发送 logEntry，保持扁平结构，不要嵌套在 details 里
    // 之前的错误写法: details: message (导致 message 对象变成了 details 字段)
    await logQueue.add('log', logEntry);
    // console.log(JSON.stringify({
    //   level: 'info',
    //   service: 'game-server',
    //   ...logEntry
    // }));
  } catch (e) {
    console.error('Failed to buffer log to Redis/Queue:', e);
  }

  // ------------------------------------------
  // 4. 实时推送 (Pub/Sub)
  // ------------------------------------------
  redisClient.publish(CHANNEL_NAME, data);
}