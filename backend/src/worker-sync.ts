// backend/src/worker-sync.ts

import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { redisClient, KEYS, parseRedisHash } from './utils/redis';
import { LandData, LandStatus } from './utils/game-keys';

dotenv.config();

console.log('💾 Sync Worker initializing (Stream Mode)...');

let isShuttingDown = false;
const BATCH_SIZE = 50;

// Create a dedicated client for blocking operations
const blockingClient = redisClient.duplicate();

blockingClient.on('error', (err) => console.error('Blocking Client Error', err));

// 辅助函数：Redis Hash -> JSON Object
function mapRedisLandToJson(data: any): LandData {
  return {
    position: Number(data.position),
    id: data.position.toString(),
    status: data.status || LandStatus.EMPTY,
    landType: data.landType || 'normal',
    cropType: data.cropId || undefined,
    plantedAt: Number(data.plantedAt) > 0 ? Number(data.plantedAt) : undefined,
    matureAt: Number(data.matureAt) > 0 ? Number(data.matureAt) : undefined,
    stolenCount: Number(data.stolenCount || 0),
    remainingHarvests: Number(data.remainingHarvests || 0),
    hasWeeds: data.hasWeeds === 'true',
    hasPests: data.hasPests === 'true',
    needsWater: data.needsWater === 'true'
  };
}

async function initStream() {
  try {
    await redisClient.xGroupCreate(KEYS.MQ_GAME_EVENTS, KEYS.GROUP_NAME_SYNC, '0', { MKSTREAM: true });
    console.log('✅ Consumer Group created');
  } catch (e: any) {
    if (e.message.includes('BUSYGROUP')) {
      console.log('ℹ️ Consumer Group already exists');
    } else {
      console.error('❌ Failed to create Consumer Group:', e);
      process.exit(1);
    }
  }
}

async function processStreamMessages() {
  try {
    // 1. 读取消息 (Use blockingClient)
    const response = await blockingClient.xReadGroup(
      KEYS.GROUP_NAME_SYNC,
      KEYS.CONSUMER_NAME,
      { key: KEYS.MQ_GAME_EVENTS, id: '>' },
      { COUNT: BATCH_SIZE, BLOCK: 2000 }
    );

    if (!response || response.length === 0) return;

    const streamEntry = response[0]; // { name: 'mq:game:events', messages: [...] }
    const messages = streamEntry.messages;

    if (messages.length === 0) return;

    console.log(`[Sync] Received ${messages.length} events`);

    // 2. 提取唯一的 playerId
    const playerIdsToSync = new Set<string>();
    const messageIdsToAck: string[] = [];

    for (const msg of messages) {
      const msgBody = msg.message; // { playerId: '...', action: '...', ts: '...' }
      if (msgBody.playerId) {
        playerIdsToSync.add(msgBody.playerId);
      }
      messageIdsToAck.push(msg.id);
    }

    if (playerIdsToSync.size > 0) {
      console.log(`[Sync] Syncing ${playerIdsToSync.size} unique players...`);

      // 3. 并行处理玩家同步
      // 注意：这里我们只处理去重后的 playerId，减少 DB 写次数
      const operations = Array.from(playerIdsToSync).map(async (playerId) => {
        try {
          const playerKey = KEYS.PLAYER(playerId);

          // A. 获取玩家基础数据
          const playerRaw = await redisClient.hGetAll(playerKey);
          if (!playerRaw || Object.keys(playerRaw).length === 0) return;
          const playerData = parseRedisHash<any>(playerRaw);

          // B. 获取该玩家的所有土地数据
          const landCount = Number(playerData.landCount || 6);

          const pipeline = redisClient.multi();
          for (let i = 0; i < landCount; i++) {
            pipeline.hGetAll(KEYS.LAND(playerId, i));
          }
          const landsRaw = await pipeline.exec();

          // C. 组装 JSON 数组
          const landsJson: LandData[] = [];
          if (landsRaw) {
            landsRaw.forEach((res) => {
              const landObj = res as unknown as Record<string, string>;
              if (landObj && Object.keys(landObj).length > 0) {
                landsJson.push(mapRedisLandToJson(landObj));
              }
            });
          }

          // D. 写入数据库
          await prisma.player.update({
            where: { id: playerId },
            data: {
              gold: Number(playerData.gold || 0),
              exp: Number(playerData.exp || 0),
              level: Number(playerData.level || 1),
              landCount: landCount,
              hasDog: playerData.hasDog === 'true',
              dogActiveUntil: playerData.dogActiveUntil && Number(playerData.dogActiveUntil) > 0
                ? new Date(Number(playerData.dogActiveUntil))
                : null,
              lands: landsJson as any
            }
          });
        } catch (err: any) {
          console.error(`[Sync] Failed to sync player ${playerId}:`, err.message);
        }
      });

      await Promise.all(operations);
    }

    // 4. Acknowledge 消息 (即使个别玩家同步失败，也不回退消息，避免死循环阻塞。也可以选择只 Ack 成功的)
    // 这里选择全部 Ack，假设错误是瞬时的或数据已被覆盖
    if (messageIdsToAck.length > 0) {
      await redisClient.xAck(KEYS.MQ_GAME_EVENTS, KEYS.GROUP_NAME_SYNC, messageIdsToAck);
    }

  } catch (err) {
    console.error('[Sync] Error processing stream:', err);
  }
}

async function startSyncLoop() {
  if (!redisClient.isOpen) await redisClient.connect();
  if (!blockingClient.isOpen) await blockingClient.connect(); // Connect blocking client
  console.log('✅ Sync Worker connected to Redis (Stream Mode)');

  await initStream();

  while (!isShuttingDown) {
    await processStreamMessages();
    // 循环间隔由 xReadGroup 的 BLOCK 控制，这里无需额外 sleep，但在无消息时 BLOCK 返回后立即再次循环
    // 为避免由于 Redis 错误导致的 tight loop，可以在 catch 中加 sleep
  }

  await blockingClient.disconnect(); // Disconnect blocking client
  await redisClient.disconnect();
  process.exit(0);
}

startSyncLoop();

process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT', () => { isShuttingDown = true; });