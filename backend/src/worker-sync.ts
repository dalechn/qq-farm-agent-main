// backend/src/worker-sync.ts

import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { redisClient, KEYS, parseRedisHash } from './utils/redis';
import { LandData, LandStatus } from './utils/game-keys';

dotenv.config();

console.log('💾 Sync Worker initializing (JSONB Mode)...');

let isShuttingDown = false;

// 辅助函数：Redis Hash -> JSON Object
function mapRedisLandToJson(data: any): LandData {
  return {
    position: Number(data.position),
    id: data.position.toString(), // 前端可能需要 id
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

async function syncDirtyPlayers() {
  const BATCH_SIZE = 50;
  let hasMoreWork = false;

  try {
    // 1. 获取脏玩家列表 (Redis Key)
    // Fix: sPop might only accept 1 arg in some types. We'll use a loop to pop batch.
    const dirtyPlayerKeys: string[] = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const id = await redisClient.sPop(KEYS.DIRTY_PLAYERS);
      if (!id) break;
      if (Array.isArray(id)) dirtyPlayerKeys.push(...id);
      else dirtyPlayerKeys.push(id);
    }

    if (dirtyPlayerKeys && dirtyPlayerKeys.length > 0) {
      if (dirtyPlayerKeys.length === BATCH_SIZE) hasMoreWork = true;
      console.log(`[Sync] Updating ${dirtyPlayerKeys.length} players...`);

      const operations = dirtyPlayerKeys.map(async (playerKey) => {
        // 解析 ID: "game:player:uuid" -> "uuid"
        const parts = playerKey.split(':');
        const realPlayerId = parts[parts.length - 1];
        if (!realPlayerId) return;

        // 2. 获取玩家基础数据
        const playerRaw = await redisClient.hGetAll(playerKey);
        if (!playerRaw || Object.keys(playerRaw).length === 0) return;
        const playerData = parseRedisHash<any>(playerRaw);

        // 3. 获取该玩家的所有土地数据
        // 从 Redis 读取 landCount，如果没读到默认 6
        const landCount = Number(playerData.landCount || 6);

        // 使用 Pipeline 批量读取所有土地 Key
        const pipeline = redisClient.multi();
        for (let i = 0; i < landCount; i++) {
          pipeline.hGetAll(KEYS.LAND(realPlayerId, i));
        }
        const landsRaw = await pipeline.exec();

        // 4. 组装 JSON 数组
        const landsJson: LandData[] = [];
        if (landsRaw) {
          landsRaw.forEach((res) => {
            // ioredis pipeline results may handle errors differently, but usually it's the result object directly in node-redis v4+ exec()
            // If using ioredis, it might be [err, result]. Assuming node-redis v4 based on keys.ts usage.
            // Cast to any to handle potential type mismatch if library types are strict
            const landObj = res as unknown as Record<string, string>;
            if (landObj && Object.keys(landObj).length > 0) {
              landsJson.push(mapRedisLandToJson(landObj));
            }
          });
        }

        // 5. 写入数据库 (包含 lands JSON)
        return prisma.player.update({
          where: { id: realPlayerId },
          data: {
            gold: Number(playerData.gold || 0),
            exp: Number(playerData.exp || 0),
            level: Number(playerData.level || 1),
            landCount: landCount,
            hasDog: playerData.hasDog === 'true',
            dogActiveUntil: playerData.dogActiveUntil && Number(playerData.dogActiveUntil) > 0
              ? new Date(Number(playerData.dogActiveUntil))
              : null,
            // [核心修改] 将土地数据存入 JSON 字段
            lands: landsJson as any
          }
        }).catch(err => console.error(`[Sync] Player ${realPlayerId} failed:`, err.message));
      });

      await Promise.all(operations);
    }
  } catch (err) {
    console.error('[Sync] Error syncing players:', err);
  }

  return hasMoreWork;
}

async function startSyncLoop() {
  if (!redisClient.isOpen) await redisClient.connect();
  console.log('✅ Sync Worker connected to Redis (JSONB Mode)');

  // 启动时清理一下旧的 dirty:lands，防止残留
  await redisClient.del(KEYS.DIRTY_LANDS);

  while (!isShuttingDown) {
    try {
      const busy = await syncDirtyPlayers();
      const sleepTime = busy ? 50 : 2000;
      await new Promise(resolve => setTimeout(resolve, sleepTime));
    } catch (error) {
      console.error('[Sync] Critical loop error:', error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  process.exit(0);
}

startSyncLoop();

process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT', () => { isShuttingDown = true; });