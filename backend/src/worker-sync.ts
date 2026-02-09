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
      // console.log('ℹ️ Consumer Group already exists');
    } else {
      console.error('❌ Failed to create Consumer Group:', e);
      process.exit(1);
    }
  }
}

// [修改] 参数化 id，使其支持读取 Pending ('0') 或 New ('>')
async function processStreamMessages(idToRead: string = '>') {
  try {
    // 只有读新消息 ('>') 时才需要阻塞等待，读 Pending ('0') 不需要阻塞
    const blockTime = idToRead === '>' ? 2000 : undefined;

    // 1. 读取消息
    // 注意：如果是读 Pending，不要用 blockingClient (因为不需要 BLOCK)，用普通 client 即可
    // 但为了代码复用，这里逻辑稍微区分一下
    let response;

    if (idToRead === '>') {
      response = await blockingClient.xReadGroup(
        KEYS.GROUP_NAME_SYNC,
        KEYS.CONSUMER_NAME,
        { key: KEYS.MQ_GAME_EVENTS, id: idToRead },
        { COUNT: BATCH_SIZE, BLOCK: blockTime }
      );
    } else {
      // 读 Pending 消息不需要阻塞，立即返回
      response = await redisClient.xReadGroup(
        KEYS.GROUP_NAME_SYNC,
        KEYS.CONSUMER_NAME,
        { key: KEYS.MQ_GAME_EVENTS, id: idToRead },
        { COUNT: BATCH_SIZE }
      );
    }

    if (!response || response.length === 0) return 0; // 返回处理数量

    const streamEntry = response[0];
    const messages = streamEntry.messages;

    if (messages.length === 0) return 0;

    if (idToRead === '0') {
      console.log(`[Sync] ⚠️ Reprocessing ${messages.length} PENDING events...`);
    } else {
      console.log(`[Sync] Received ${messages.length} events`);
    }

    // 2. 提取唯一的 playerId
    const playerIdsToSync = new Set<string>();
    const messageIdsToAck: string[] = [];

    for (const msg of messages) {
      const msgBody = msg.message;
      if (msgBody.playerId) {
        playerIdsToSync.add(msgBody.playerId);
      }
      messageIdsToAck.push(msg.id);
    }

    if (playerIdsToSync.size > 0) {
      console.log(`[Sync] Syncing ${playerIdsToSync.size} unique players...`);

      // 3. 并行处理玩家同步
      // 我们的逻辑是：只要收到了消息，就去拉取 Redis 最新状态覆盖 DB。
      // 所以即使是旧的 Pending 消息，拉取的也是最新状态，这是天然幂等的，非常安全。
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
              dogId: playerData.dogId || 'dog_1',
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

    // 4. Acknowledge 消息
    if (messageIdsToAck.length > 0) {
      await redisClient.xAck(KEYS.MQ_GAME_EVENTS, KEYS.GROUP_NAME_SYNC, messageIdsToAck);
    }

    return messages.length;

  } catch (err) {
    console.error('[Sync] Error processing stream:', err);
    return 0;
  }
}

// [新增] 处理 Pending 消息的循环
async function processPendingEvents() {
  console.log('[Sync] Checking for pending (unacknowledged) messages...');
  while (true) {
    // 循环读取 ID='0'，直到没有 Pending 消息为止
    const count = await processStreamMessages('0');
    if (count === 0) break;
  }
  console.log('[Sync] Pending messages check complete.');
}

async function startSyncLoop() {
  if (!redisClient.isOpen) await redisClient.connect();
  if (!blockingClient.isOpen) await blockingClient.connect();
  console.log('✅ Sync Worker connected to Redis (Stream Mode)');

  await initStream();

  // 1. 启动时优先处理 Pending
  await processPendingEvents();

  // 2. 进入主循环处理新消息
  while (!isShuttingDown) {
    await processStreamMessages('>');
  }

  await blockingClient.disconnect();
  await redisClient.disconnect();
  process.exit(0);
}

startSyncLoop();

process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT', () => { isShuttingDown = true; });