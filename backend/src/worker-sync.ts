// backend/src/worker-sync.ts

import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { redisClient, KEYS, parseRedisHash } from './utils/redis';
import { LandStatus } from './utils/game-keys';

dotenv.config();

console.log('💾 Sync Worker initializing...');

let isShuttingDown = false;

// 辅助函数：Redis Hash -> Prisma Object
function mapRedisLandToPrisma(data: any) {
  return {
    status: data.status || LandStatus.EMPTY,
    landType: data.landType || 'normal',
    cropType: data.cropId || null,
    plantedAt: data.plantedAt && Number(data.plantedAt) > 0 ? new Date(Number(data.plantedAt)) : null,
    matureAt: data.matureAt && Number(data.matureAt) > 0 ? new Date(Number(data.matureAt)) : null,
    stolenCount: Number(data.stolenCount || 0),
    remainingHarvests: Number(data.remainingHarvests || 0),
    hasWeeds: data.hasWeeds === 'true',
    hasPests: data.hasPests === 'true',
    needsWater: data.needsWater === 'true',
    lastCalculatedAt: new Date()
  };
}

async function syncDirtyData() {
  const BATCH_SIZE = 50;
  let hasMoreWork = false;

  // -------------------------
  // 1. 同步玩家 (Dirty Players)
  // -------------------------
  try {
    // @ts-ignore
    const playerIds = (await redisClient.sPop(KEYS.DIRTY_PLAYERS, BATCH_SIZE)) as unknown as string[];

    if (playerIds && playerIds.length > 0) {
      if (playerIds.length === BATCH_SIZE) hasMoreWork = true;
      console.log(`[Sync] Updating ${playerIds.length} players...`);

      const operations = playerIds.map(async (playerId) => {
        const raw = await redisClient.hGetAll(KEYS.PLAYER(playerId));
        if (!raw || Object.keys(raw).length === 0) return;
        const data = parseRedisHash<any>(raw);

        return prisma.player.update({
          where: { id: playerId },
          data: {
            gold: Number(data.gold || 0),
            exp: Number(data.exp || 0),
            level: Number(data.level || 1),
            // landCount: Number(data.landCount || 6),
            hasDog: data.hasDog === 'true',
            dogActiveUntil: data.dogActiveUntil && Number(data.dogActiveUntil) > 0
              ? new Date(Number(data.dogActiveUntil))
              : null,
          }
        }).catch(err => console.error(`[Sync] Player ${playerId} failed:`, err.message));
      });

      await Promise.all(operations);
    }
  } catch (err) {
    console.error('[Sync] Error syncing players:', err);
  }

  // -------------------------
  // 2. 同步土地 (Dirty Lands)
  // -------------------------
  try {
    // @ts-ignore
    const dirtyKeys = (await redisClient.sPop(KEYS.DIRTY_LANDS, BATCH_SIZE)) as unknown as string[];

    if (dirtyKeys && dirtyKeys.length > 0) {
      if (dirtyKeys.length === BATCH_SIZE) hasMoreWork = true;
      console.log(`[Sync] Updating ${dirtyKeys.length} lands...`);

      const operations = dirtyKeys.map(async (keyStr) => {
        const [playerId, posStr] = keyStr.split(':');
        const position = parseInt(posStr);
        const redisLandKey = KEYS.LAND(playerId, position);

        const raw = await redisClient.hGetAll(redisLandKey);
        if (!raw || Object.keys(raw).length === 0) return;

        const updateData = mapRedisLandToPrisma(raw);

        return prisma.land.upsert({
          where: { playerId_position: { playerId, position } },
          update: updateData,
          create: { playerId, position, ...updateData }
        }).catch(err => console.error(`[Sync] Land ${keyStr} failed:`, err.message));
      });

      await Promise.all(operations);
    }
  } catch (err) {
    console.error('[Sync] Error syncing lands:', err);
  }

  return hasMoreWork;
}

async function startSyncLoop() {
  if (!redisClient.isOpen) await redisClient.connect();
  console.log('✅ Sync Worker connected to Redis');

  while (!isShuttingDown) {
    try {
      const busy = await syncDirtyData();

      // 动态休眠：如果刚才满载，只休息50ms；如果闲置，休息2s
      const sleepTime = busy ? 50 : 2000;
      await new Promise(resolve => setTimeout(resolve, sleepTime));

    } catch (error) {
      console.error('[Sync] Critical loop error:', error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log('🛑 Sync Worker stopped gracefully.');
  process.exit(0);
}

// 启动
startSyncLoop();

// 信号处理
process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT', () => { isShuttingDown = true; });