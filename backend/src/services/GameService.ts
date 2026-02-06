// backend/src/services/GameService.ts

import prisma from '../utils/prisma';
import {
  redisClient,
  acquireLock,
  releaseLock,
  updateLeaderboard,
  getPlayerStateKey,
  invalidatePlayerCache,
  getLandLockKey,
  getPlayerExpandLockKey,
  getPlayerDogLockKey,
  checkAndMarkCareToday,
  checkAndMarkShovelToday,
  checkAndMarkStealToday,
  QUEUE_FARM_EVENTS
} from '../utils/redis';
import { broadcast } from '../utils/websocket';
import { GAME_CONFIG, CROPS } from '../utils/game-keys';

const LAND_LIMIT = GAME_CONFIG.LAND.MAX_LIMIT;
const LAND_LEVELS = GAME_CONFIG.LAND_LEVELS;
const LAND_UPGRADE_CONFIG = GAME_CONFIG.LAND_UPGRADE;
const FERTILIZER_CONFIG = GAME_CONFIG.FERTILIZER;
const BASE_RATES = GAME_CONFIG.BASE_RATES;
const LAND_EXPAND_BASE_COST = GAME_CONFIG.LAND.EXPAND_BASE_COST;
const DOG_CONFIG = GAME_CONFIG.DOG;

// 定义缓存过期时间 (秒) - 稍微短一点，防止前端倒计时和后端差异太大
const STATE_CACHE_TTL = 10; 

export class GameService {
  
  // ================= 核心优化：获取玩家状态 (缓存 + 批量更新) =================
  static async getPlayerState(playerId: string) {
    const cacheKey = getPlayerStateKey(playerId);

    // 1. 尝试从 Redis 获取缓存
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // 2. 缓存未命中，查询数据库
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { lands: { orderBy: { position: 'asc' } } }
    });
    
    if (!player) return null;

    const now = new Date();
    const updateOperations: any[] = []; // 用于收集批量更新的操作
    
    // 3. 遍历土地进行状态“补算” (只在内存中计算，收集 DB 写操作)
    // 使用 map 生成新的 lands 数组，而不是直接修改 player.lands
    const updatedLands = player.lands.map((land) => {
      let needsUpdate = false;
      let updateData: any = {};
      
      // (A) 检查成熟
      if (land.status === 'planted' && land.matureAt && land.matureAt <= now) {
        updateData.status = 'harvestable';
        needsUpdate = true;
      }

      // (B) 惰性计算灾害
      // 这里逻辑保持不变，但要小心引用修改
      const currentStatus = updateData.status || land.status;
      
      if (currentStatus === 'planted') {
        const lastCalc = land.lastCalculatedAt ? new Date(land.lastCalculatedAt) : (land.plantedAt ? new Date(land.plantedAt) : now);
        const diffMs = now.getTime() - lastCalc.getTime();
        const diffMinutes = Math.floor(diffMs / 60000); 

        if (diffMinutes > 0) {
          if (!land.hasWeeds) {
            const prob = 1 - Math.pow(1 - BASE_RATES.WEED, diffMinutes);
            if (Math.random() < prob) { updateData.hasWeeds = true; needsUpdate = true; }
          }
          if (!land.hasPests) {
             const prob = 1 - Math.pow(1 - BASE_RATES.PEST, diffMinutes);
             if (Math.random() < prob) { updateData.hasPests = true; needsUpdate = true; }
          }
          if (!land.needsWater) {
             const prob = 1 - Math.pow(1 - BASE_RATES.WATER, diffMinutes);
             if (Math.random() < prob) { updateData.needsWater = true; needsUpdate = true; }
          }
          updateData.lastCalculatedAt = now;
          needsUpdate = true;
        }
      } else {
          // 空地或枯萎也要刷新 lastCalculatedAt 避免溢出
          if (!land.lastCalculatedAt || (now.getTime() - new Date(land.lastCalculatedAt).getTime() > 60000)) {
             updateData.lastCalculatedAt = now;
             needsUpdate = true;
          }
      }

      // (C) 如果需要更新，添加到事务队列，并合并到返回对象中
      if (needsUpdate) {
        updateOperations.push(
          prisma.land.update({
            where: { id: land.id },
            data: updateData
          })
        );
        // 返回合并后的新状态用于前端显示
        return { ...land, ...updateData }; 
      }
      
      return land;
    });

    // 4. 执行批量更新 (如果有)
    if (updateOperations.length > 0) {
      // 使用事务并行执行所有 update，比 for loop await 快得多
      await prisma.$transaction(updateOperations);
    }

    const finalResult = { ...player, lands: updatedLands };

    // 5. 写入 Redis 缓存 (设置过期时间，比如 10 秒)
    // 这样高频刷新 (F5) 时直接读 Redis，减轻 DB 压力
    await redisClient.set(cacheKey, JSON.stringify(finalResult), { EX: STATE_CACHE_TTL });

    return finalResult;
  }

  // ================= 优化：种植 (加锁 + 清缓存 + 队列广播) =================
  static async plant(playerId: string, playerName: string, position: number, cropType: string) {
    // 1. 获取土地 ID (为了加锁)
    // 这里必须先查一次 DB 确认 ID，或者如果前端传了 ID 更好。
    // 假设只传了 position，我们需要先锁定 "玩家+位置" 或者先查出 ID
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });
    if (!land) throw new Error('Land not found');

    const lockKey = getLandLockKey(land.id);
    // 2. 尝试获取分布式锁
    if (!await acquireLock(lockKey)) {
      throw new Error('Operation too frequent, please try again later');
    }

    try {
      // 再次检查状态 (Double Check)，防止在等待锁的过程中状态变了
      // 实际上由于 Prisma 事务隔离，下面这步可以省略，但为了逻辑严谨保留
      // 重点：检查业务逻辑
      if (land.status !== 'empty') throw new Error('Land not available');

      const crop = await prisma.crop.findUnique({ where: { type: cropType } });
      if (!crop) throw new Error('Crop not found');

      const player = await prisma.player.findUnique({ where: { id: playerId } });
      if (!player || player.gold < crop.seedPrice) throw new Error('Insufficient gold');

      const landLevelIndex = LAND_LEVELS.indexOf(land.landType as any);
      const reqLevelIndex = LAND_LEVELS.indexOf(crop.requiredLandType as any);

      if (landLevelIndex < reqLevelIndex) {
          throw new Error(`This crop requires ${crop.requiredLandType} soil or better.`);
      }

      const now = new Date();
      const matureAt = new Date(now.getTime() + crop.matureTime * 1000);

      // 3. 执行事务 (原子操作)
      const [updatedPlayer, updatedLand] = await prisma.$transaction([
        prisma.player.update({
          where: { id: playerId },
          data: { gold: { decrement: crop.seedPrice } } // 原子扣减
        }),
        prisma.land.update({
          where: { id: land.id },
          data: {
            status: 'planted',
            cropType,
            plantedAt: now,
            matureAt,
            lastCalculatedAt: now, 
            remainingHarvests: crop.maxHarvests,
            hasWeeds: false,
            hasPests: false,
            needsWater: false,
            stolenCount: 0
          }
        })
      ]);

      updateLeaderboard('gold', playerId, updatedPlayer.gold).catch(console.error);

      // 4. 发送种植事件到队列（Worker 统一广播）
      // playerName 已由 API 层传入，无需再查数据库
      // 直接广播，不经过队列
      await broadcast({
        type: 'action',
        action: 'PLANT',
        playerId,
        playerName,
        details: `Planted ${crop.name} at position [${position}] (${crop.matureTime}s to mature)`,
        timestamp: now.toISOString()
      });

      // 5. 清除缓存
      await invalidatePlayerCache(playerId);

      return updatedLand;

    } finally {
      // 5. 释放锁
      await releaseLock(lockKey);
    }
  }

  // ================= 照料 (加锁 + 防刷 + 通知/广播) =================
  static async care(operatorId: string, operatorName: string, ownerId: string, ownerName: string, position: number, type: 'water' | 'weed' | 'pest') {
    // 先查 landId
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId: ownerId, position } }
    });
    if (!land) throw new Error('Land not found');

    const lockKey = getLandLockKey(land.id);
    if (!await acquireLock(lockKey)) throw new Error('Land is busy');

    try {
      // Double check status inside lock is recommended but omitted for brevity if Logic ensures logic check
      if (land.status !== 'planted') throw new Error('Can only care for growing crops');

      // 每日防刷检查 (Redis)
      const alreadyCared = await checkAndMarkCareToday(operatorId, ownerId, position, type);
      if (alreadyCared) throw new Error('Already cared today');

      let updateData: any = {};
      const expReward = 10;
      const careTypeNames = { water: 'Watered', weed: 'Removed Weeds', pest: 'Removed Pests' };

      if (type === 'water') {
          if (!land.needsWater) throw new Error('No water needed');
          updateData.needsWater = false;
      } else if (type === 'weed') {
          if (!land.hasWeeds) throw new Error('No weeds found');
          updateData.hasWeeds = false;
      } else if (type === 'pest') {
          if (!land.hasPests) throw new Error('No pests found');
          updateData.hasPests = false;
      } else {
          throw new Error('Invalid care type');
      }

      // operatorName 和 ownerName 已由 API 层传入，无需再查数据库

      const [updatedLand, updatedOperator] = await prisma.$transaction([
        prisma.land.update({ where: { id: land.id }, data: updateData }),
        prisma.player.update({ where: { id: operatorId }, data: { exp: { increment: expReward } } })
      ]);

      const newLevel = Math.floor(Math.sqrt(updatedOperator.exp / 10)) + 1;
      if (newLevel !== updatedOperator.level) {
        await prisma.player.update({ where: { id: operatorId }, data: { level: newLevel } });
        updateLeaderboard('level', operatorId, newLevel).catch(console.error);
      }

      // 发送照料事件（Worker 统一处理通知和广播）
      // 直接广播，不经过队列
      const careTimestamp = new Date().toISOString();
      if (operatorId === ownerId) {
        // 自己照料自己的地
        await broadcast({
          type: 'action',
          action: 'CARE',
          playerId: operatorId,
          playerName: operatorName,
          details: `${careTypeNames[type]} own crop at position [${position}] (+${expReward} exp)`,
          timestamp: careTimestamp
        });
      } else {
        // 帮别人照料：操作者视角
        await broadcast({
          type: 'action',
          action: 'CARE',
          playerId: operatorId,
          playerName: operatorName,
          details: `${careTypeNames[type]} ${ownerName}'s land at position [${position}] (+${expReward} exp)`,
          timestamp: careTimestamp
        });

        // 帮别人照料：被帮助者视角
        await broadcast({
          type: 'action',
          action: 'CARED',
          playerId: ownerId,
          playerName: ownerName,
          details: `${operatorName} ${careTypeNames[type]} your crop at position [${position}]`,
          timestamp: careTimestamp
        }, false);
      }

      // 清除缓存 (注意：如果操作的是别人的地，要清两个人的缓存？)
      // owner 的地状态变了 -> 清 owner
      // operator 的经验变了 -> 清 operator
      await invalidatePlayerCache(ownerId);
      if (ownerId !== operatorId) {
        await invalidatePlayerCache(operatorId);
      }

      return { success: true, exp: expReward, land: updatedLand };
    } finally {
      await releaseLock(lockKey);
    }
  }

  // ================= 优化：收获 (加锁 + 原子操作 + 清缓存 + 队列广播) =================
  static async harvest(playerId: string, playerName: string, position: number) {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });

    if (!land) throw new Error('Land not found');

    // ★ 关键：分布式锁
    const lockKey = getLandLockKey(land.id);
    if (!await acquireLock(lockKey)) throw new Error('Harvesting too fast!');

    try {
      // 在锁内重新校验状态 (必须!)
      // 因为在 acquireLock 等待期间，可能已经被偷了或者被收了
      const currentLand = await prisma.land.findUnique({ where: { id: land.id }});
      if (!currentLand || currentLand.status !== 'harvestable' || !currentLand.cropType) {
        throw new Error('Nothing to harvest (status changed)');
      }

      const crop = await prisma.crop.findUnique({ where: { type: currentLand.cropType } });
      if (!crop) throw new Error('Crop config missing');

      const baseYield = Math.max(1, crop.yield - currentLand.stolenCount);
      
      let penaltyRate = 0;
      if (currentLand.hasWeeds) penaltyRate += 0.20;
      if (currentLand.hasPests) penaltyRate += 0.30;
      if (currentLand.needsWater) penaltyRate += 0.20;
      penaltyRate = Math.min(0.9, penaltyRate);

      const grossIncome = crop.sellPrice * baseYield;
      const penaltyAmount = Math.floor(grossIncome * penaltyRate);
      const netIncome = Math.max(0, grossIncome - penaltyAmount);
      const rewardExp = crop.exp;

      // 准备下一季状态
      let newLandStatus = 'empty';
      let newMatureAt = null;
      let newRemainingHarvests = currentLand.remainingHarvests - 1;
      const now = new Date();
      
      if (newRemainingHarvests > 0) {
          newLandStatus = 'planted';
          newMatureAt = new Date(now.getTime() + crop.regrowTime * 1000);
      } else {
          newLandStatus = 'withered'; // 或者 empty，看设计，原代码是 withered
          newRemainingHarvests = 0;
      }

      // 获取玩家名字（用于广播）
      // playerName 已由 API 层传入，无需再查数据库

      // 事务更新
      const [updatedPlayer] = await prisma.$transaction([
        prisma.player.update({
          where: { id: playerId },
          data: {
            gold: { increment: netIncome },
            exp: { increment: rewardExp }
          }
        }),
        prisma.land.update({
          where: { id: land.id },
          data: {
            status: newLandStatus,
            matureAt: newMatureAt,
            remainingHarvests: newRemainingHarvests,
            stolenCount: 0,
            hasWeeds: false,
            hasPests: false,
            needsWater: false,
            lastCalculatedAt: now
          }
        })
      ]);
      
      updateLeaderboard('gold', playerId, updatedPlayer.gold).catch(console.error);
      const newLevel = Math.floor(Math.sqrt(updatedPlayer.exp / 10)) + 1;
      if (newLevel !== updatedPlayer.level) {
          await prisma.player.update({ where: { id: playerId }, data: { level: newLevel } });
          updateLeaderboard('level', playerId, newLevel).catch(console.error);
      }

      // 发送收获事件到队列（Worker 统一广播）
      // playerName 已由 API 层传入，无需再查数据库
      // 直接广播，不经过队列
      let details = `Harvested ${crop.name} at position [${position}] +${netIncome} gold`;
      if (rewardExp > 0) details += ` (+${rewardExp} exp)`;
      if (penaltyAmount > 0) details += ` (-${penaltyAmount} penalty)`;
      if (newRemainingHarvests > 0) details += " (next season)";
      if (newRemainingHarvests === 0) details += " (withered)";

      await broadcast({
        type: 'action',
        action: 'HARVEST',
        playerId,
        playerName,
        details,
        timestamp: now.toISOString()
      });

      // 清缓存
      await invalidatePlayerCache(playerId);

      return { 
          gold: netIncome, 
          exp: rewardExp, 
          penalty: penaltyAmount, 
          nextSeason: newRemainingHarvests > 0,
          isWithered: newRemainingHarvests === 0
      };

    } finally {
      await releaseLock(lockKey);
    }
  }

  // ================= 铲除 (加锁 + 防刷 + 通知/广播) =================
  static async shovel(operatorId: string, operatorName: string, ownerId: string, ownerName: string, position: number) {
    const land = await prisma.land.findUnique({
        where: { playerId_position: { playerId: ownerId, position } }
    });
    if (!land) throw new Error('Land not found');

    const lockKey = getLandLockKey(land.id);
    if (!await acquireLock(lockKey)) throw new Error('Land is busy');

    try {
        if (land.status !== 'withered') throw new Error('Nothing to shovel');

        // 每日防刷检查 (Redis)
        const alreadyShoveled = await checkAndMarkShovelToday(operatorId, ownerId, position);
        if (alreadyShoveled) throw new Error('Already shoveled today');

        const expReward = 15;
        const now = new Date();

        // operatorName 和 ownerName 已由 API 层传入，无需再查数据库

        const [updatedLand, updatedOperator] = await prisma.$transaction([
            prisma.land.update({
                where: { id: land.id },
                data: {
                    status: 'empty',
                    cropType: null,
                    plantedAt: null,
                    matureAt: null,
                    hasWeeds: false,
                    hasPests: false,
                    needsWater: false,
                    remainingHarvests: 0,
                    stolenCount: 0,
                    lastCalculatedAt: now
                }
            }),
            prisma.player.update({
                where: { id: operatorId },
                data: { exp: { increment: expReward } }
            })
        ]);

        const newLevel = Math.floor(Math.sqrt(updatedOperator.exp / 10)) + 1;
        if (newLevel !== updatedOperator.level) {
            await prisma.player.update({ where: { id: operatorId }, data: { level: newLevel } });
            updateLeaderboard('level', operatorId, newLevel).catch(console.error);
        }

      // 发送铲除事件（Worker 统一处理通知和广播）
      // 直接广播，不经过队列
      const shovelTimestamp = new Date().toISOString();
      if (operatorId === ownerId) {
        // 自己铲除自己的枯萎作物
        await broadcast({
          type: 'action',
          action: 'SHOVEL',
          playerId: operatorId,
          playerName: operatorName,
          details: `Cleared withered crop at position [${position}] (+${expReward} exp)`,
          timestamp: shovelTimestamp
        });
      } else {
        // 帮别人铲除：操作者视角
        await broadcast({
          type: 'action',
          action: 'SHOVEL',
          playerId: operatorId,
          playerName: operatorName,
          details: `Cleared withered crop for ${ownerName} at position [${position}] (+${expReward} exp)`,
          timestamp: shovelTimestamp
        });

        // 帮别人铲除：被帮助者视角
        await broadcast({
          type: 'action',
          action: 'SHOVELED',
          playerId: ownerId,
          playerName: ownerName,
          details: `${operatorName} cleared your withered crop at position [${position}]`,
          timestamp: shovelTimestamp
        }, false);
      }

        await invalidatePlayerCache(ownerId);
        if (operatorId !== ownerId) await invalidatePlayerCache(operatorId);

        return { success: true, exp: expReward, land: updatedLand };
    } finally {
        await releaseLock(lockKey);
    }
  }

  // ================= 优化：扩建 (加锁 - 锁玩家) =================
  // 扩建不针对特定土地，而是针对玩家资产，建议锁玩家
  static async expandLand(playerId: string) {
    const lockKey = getPlayerExpandLockKey(playerId);
    if (!await acquireLock(lockKey)) throw new Error('System processing');

    try {
        const player = await prisma.player.findUnique({ 
            where: { id: playerId },
            include: { lands: true }
        });
        
        if (!player) throw new Error('Player not found');
        if (player.lands.length >= LAND_LIMIT) throw new Error('Max land limit reached');

        const expandCost = LAND_EXPAND_BASE_COST * player.lands.length; 
        if (player.gold < expandCost) throw new Error(`Insufficient gold. Need ${expandCost}`);

        const newPosition = player.lands.length; 

        await prisma.$transaction([
          prisma.player.update({
            where: { id: playerId },
            data: { gold: { decrement: expandCost } }
          }),
          prisma.land.create({
            data: {
              playerId,
              position: newPosition,
              status: 'empty',
              landType: 'normal'
            }
          })
        ]);

        await invalidatePlayerCache(playerId);

        return { success: true, newPosition, cost: expandCost };
    } finally {
        await releaseLock(lockKey);
    }
  }

  // ================= 优化：升级土地 (加锁) =================
  static async upgradeLand(playerId: string, position: number) {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });
    if (!land) throw new Error('Land not found');

    const lockKey = getLandLockKey(land.id);
    if (!await acquireLock(lockKey)) throw new Error('System processing');

    try {
        const config = LAND_UPGRADE_CONFIG[land.landType as keyof typeof LAND_UPGRADE_CONFIG];
        if (!config || !config.next) throw new Error('Max level reached');

        const player = await prisma.player.findUnique({ where: { id: playerId } });
        // 建议在事务前再次检查 gold，或者利用 DB check constraint，这里为了简化沿用逻辑
        if (!player) throw new Error('Player not found');
        if (player.level < config.levelReq) throw new Error(`Player level ${config.levelReq} required`);
        if (player.gold < config.price) throw new Error(`Insufficient gold. Need ${config.price}`);

        const updatedLand = await prisma.$transaction([
           prisma.player.update({
             where: { id: playerId },
             data: { gold: { decrement: config.price } }
           }),
           prisma.land.update({
             where: { id: land.id },
             data: { landType: config.next }
           })
        ]);

        await invalidatePlayerCache(playerId);
        
        // updateMany 这里的返回值在 transaction 里是数组
        return { success: true, land: updatedLand[1] };
    } finally {
        await releaseLock(lockKey);
    }
  }

  // ================= 优化：化肥 (加锁) =================
  static async useFertilizer(playerId: string, position: number, type: 'normal' | 'high') {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });
    if (!land) throw new Error('Land not found');

    const lockKey = getLandLockKey(land.id);
    if (!await acquireLock(lockKey)) throw new Error('Busy');

    try {
        // Double check
        if (land.status !== 'planted') throw new Error('Can only fertilize growing crops');

        const player = await prisma.player.findUnique({ where: { id: playerId } });
        const config = FERTILIZER_CONFIG[type];
        if (!config) throw new Error('Invalid fertilizer type');
        if (player!.gold < config.price) throw new Error('Insufficient gold');

        const currentMatureAt = new Date(land.matureAt!);
        const newMatureAt = new Date(currentMatureAt.getTime() - config.reduceSeconds * 1000);

        await prisma.$transaction([
          prisma.player.update({
            where: { id: playerId },
            data: { gold: { decrement: config.price } }
          }),
          prisma.land.update({
            where: { id: land.id },
            data: { matureAt: newMatureAt }
          })
        ]);

        await invalidatePlayerCache(playerId);
        return { success: true, newMatureAt, type, cost: config.price };
    } finally {
        await releaseLock(lockKey);
    }
  }

  // 买狗和喂狗 涉及金币操作，建议也加上简单的锁防止双击购买
  static async buyDog(playerId: string) {
    const lockKey = getPlayerDogLockKey(playerId);
    if (!await acquireLock(lockKey)) throw new Error('Processing');

    try {
        const player = await prisma.player.findUnique({ where: { id: playerId } });
        if (player?.hasDog) throw new Error('Already have dog');
        if (player!.gold < DOG_CONFIG.PRICE) throw new Error('No money');

        await prisma.player.update({
          where: { id: playerId },
          data: {
            gold: { decrement: DOG_CONFIG.PRICE },
            hasDog: true,
            dogActiveUntil: new Date()
          }
        });
        await invalidatePlayerCache(playerId);
        return { success: true };
    } finally {
        await releaseLock(lockKey);
    }
  }

  static async feedDog(playerId: string) {
    const lockKey = getPlayerDogLockKey(playerId);
    if (!await acquireLock(lockKey)) throw new Error('Processing');
    try {
        const player = await prisma.player.findUnique({ where: { id: playerId } });
        if (!player!.hasDog) throw new Error('No dog');
        if (player!.gold < DOG_CONFIG.FOOD_PRICE) throw new Error('No money');

        const now = new Date();
        const currentActive = player!.dogActiveUntil && player!.dogActiveUntil > now 
          ? player!.dogActiveUntil 
          : now;
        
        const newActiveUntil = new Date(currentActive.getTime() + DOG_CONFIG.FOOD_DURATION * 1000);

        await prisma.player.update({
          where: { id: playerId },
          data: {
            gold: { decrement: DOG_CONFIG.FOOD_PRICE },
            dogActiveUntil: newActiveUntil
          }
        });
await invalidatePlayerCache(playerId);
        return { success: true, activeUntil: newActiveUntil };
    } finally {
      await releaseLock(lockKey);
    }
  }

  // ==================== 偷菜 ====================
static async stealCrop(stealerId: string, victimId: string, position: number) {
  const targetLand = await prisma.land.findUnique({
    where: { playerId_position: { playerId: victimId, position } }
  });
  if (!targetLand) throw new Error('Land not found');

  const lockKey = getLandLockKey(targetLand.id);
  const hasLock = await acquireLock(lockKey, 3);
  if (!hasLock) throw new Error('Too busy! Someone is interacting with this land.');

  try {
    const land = await prisma.land.findUnique({ where: { id: targetLand.id } });
    if (!land || land.status !== 'harvestable') throw new Error('Too late! Nothing to steal.');

    const victim = await prisma.player.findUnique({
      where: { id: victimId },
      select: { name: true, hasDog: true, dogActiveUntil: true, gold: true }
    });

    const now = new Date();
    const stealTimestamp = now.toISOString();

    // === 🐶 看门狗逻辑 ===
    const isDogActive = victim?.hasDog && victim.dogActiveUntil && victim.dogActiveUntil > now;
    if (isDogActive && Math.random() < DOG_CONFIG.BITE_RATE) {
      const stealer = await prisma.player.findUnique({ where: { id: stealerId } });
      const penalty = Math.min(stealer?.gold || 0, DOG_CONFIG.PENALTY_GOLD);

      if (penalty > 0) {
        await prisma.$transaction([
          prisma.player.update({ where: { id: stealerId }, data: { gold: { decrement: penalty } } }),
          prisma.player.update({ where: { id: victimId }, data: { gold: { increment: penalty } } })
        ]);
      }

      // 直接广播被狗咬事件，不经过队列
      await broadcast({
        type: 'action',
        action: 'STEAL_FAIL',
        playerId: stealerId,
        playerName: stealer?.name,
        details: `Bitten by ${victim?.name}'s dog while stealing! Lost ${penalty} gold`,
        timestamp: stealTimestamp
      });

      // 广播给狗主人
      await broadcast({
        type: 'action',
        action: 'DOG_BITTEN',
        playerId: victimId,
        playerName: victim?.name,
        details: `Your dog caught ${stealer?.name}, you got ${penalty} gold!`,
        timestamp: stealTimestamp
      }, false);

      await invalidatePlayerCache(stealerId);
      await invalidatePlayerCache(victimId);

      return {
        success: false,
        code: 'DOG_BITTEN',
        message: `Bitten by ${victim?.name}'s dog! Lost ${penalty} gold`,
        penalty
      };
    }

    // === 🛡️ 偷窃次数校验 (无硬上限) ===
    
    const crop = CROPS.find(c => c.type === land.cropType);
    if (!crop) throw new Error('Crop config not found');

    // [修改点] 取消 3 次硬上限，完全由 yield 决定
    // 只要给主人留 1 个就行 (Yield - 1)
    // 如果 yield 是 1，maxSteals 就是 0 (不可偷)
    // 如果 yield 是 10，maxSteals 就是 9 (可以被偷 9 次)
    const maxSteals = Math.max(0, crop.yield - 1);

    if (land.stolenCount >= maxSteals) {
       throw new Error('This crop has barely enough yield left for the owner!');
    }

    // === 🚫 每日防刷检查 ===
    const alreadyStolen = await checkAndMarkStealToday(stealerId, victimId, position);
    if (alreadyStolen) throw new Error('Already stolen today');

    // === 💰 执行偷窃 ===
    const stealAmount = 1;
    const goldValue = crop.sellPrice * stealAmount;

    const [updatedLand, updatedStealer] = await prisma.$transaction([
      prisma.land.update({
        where: { id: land.id },
        data: { stolenCount: { increment: 1 } }
      }),
      prisma.player.update({
        where: { id: stealerId },
        data: { gold: { increment: goldValue } }
      })
    ]);

    const stealerName = (await prisma.player.findUnique({where: {id: stealerId}, select: {name:true}}))?.name;

    // 直接广播偷菜成功事件，不经过队列
    // 偷菜者视角
    await broadcast({
      type: 'action',
      action: 'STEAL',
      playerId: stealerId,
      playerName: stealerName,
      details: `Stole ${crop.name} from ${victim?.name}`,
      timestamp: stealTimestamp
    });

    // 被偷者视角
    await broadcast({
      type: 'action',
      action: 'STOLEN',
      playerId: victimId,
      playerName: victim?.name,
      details: `${stealerName} stole your ${crop.name} (${stealAmount}) at position ${position}!`,
      timestamp: stealTimestamp
    }, false);

    updateLeaderboard('gold', stealerId, updatedStealer.gold).catch(console.error);

    await invalidatePlayerCache(stealerId);
    await invalidatePlayerCache(victimId);

    return {
      success: true,
      stolen: {
        cropType: land.cropType,
        cropName: crop.name,
        amount: stealAmount,
        goldValue
      }
    };

  } finally {
    await releaseLock(lockKey);
  }
}
}