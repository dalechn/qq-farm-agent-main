// backend/src/services/GameService.ts

import { redisClient, KEYS, parseRedisHash } from '../utils/redis';
import { LUA_SCRIPTS } from '../utils/lua-scripts';
import prisma from '../utils/prisma';
import { GAME_CONFIG, CROPS, LandStatus } from '../utils/game-keys';
import { broadcast } from '../utils/websocket';

const MAX_DAILY_CARE_EXP = 1000;
const DISASTER_CHECK_INTERVAL = 5 * 60 * 1000;

export class GameService {

  // ==========================================
  // 缓存与加载逻辑
  // ==========================================

  private static async getPlayerName(playerId: string): Promise<string> {
    const name = await redisClient.hGet(KEYS.PLAYER(playerId), 'name');
    return name || 'Farmer';
  }

  private static async ensurePlayerLoaded(playerId: string) {
    const playerKey = KEYS.PLAYER(playerId);
    if (await redisClient.exists(playerKey)) return;

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { lands: true }
    });

    if (!player) throw new Error('Player not found');

    const playerData: Record<string, string> = {
      id: player.id,
      name: player.name,
      gold: player.gold.toString(),
      exp: player.exp.toString(),
      level: player.level.toString(),
      avatar: player.avatar,
      twitter: player.twitter || '',
      createdAt: player.createdAt.toISOString(),
      landCount: player.lands.length.toString(),
      hasDog: player.hasDog ? 'true' : 'false',
      dogActiveUntil: player.dogActiveUntil ? player.dogActiveUntil.getTime().toString() : '0',
      lastDisasterCheck: '0'
    };
    await redisClient.hSet(playerKey, playerData);

    for (const land of player.lands) {
      const landKey = KEYS.LAND(player.id, land.position);
      const landData: Record<string, string> = {
        id: land.id.toString(),
        dbId: land.id.toString(),
        position: land.position.toString(),
        status: land.status || LandStatus.EMPTY,
        landType: land.landType,
        cropId: land.cropType || '',
        matureAt: land.matureAt ? land.matureAt.getTime().toString() : '0',
        plantedAt: land.plantedAt ? land.plantedAt.getTime().toString() : '0',
        remainingHarvests: land.remainingHarvests.toString(),
        stolenCount: land.stolenCount.toString(),
        hasWeeds: land.hasWeeds ? 'true' : 'false',
        hasPests: land.hasPests ? 'true' : 'false',
        needsWater: land.needsWater ? 'true' : 'false'
      };
      await redisClient.hSet(landKey, landData);
    }
    await redisClient.expire(playerKey, 86400 * 3);
  }

  static async getPlayerState(playerId: string) {
    await this.ensurePlayerLoaded(playerId);
    await this.tryTriggerDisasters(playerId);

    const pipeline = redisClient.multi();
    pipeline.hGetAll(KEYS.PLAYER(playerId));
    for (let i = 0; i < GAME_CONFIG.LAND.MAX_LIMIT; i++) {
      pipeline.hGetAll(KEYS.LAND(playerId, i));
    }
    const results = await pipeline.exec();

    const playerRaw = results[0] as any;
    if (!playerRaw || Object.keys(playerRaw).length === 0) throw new Error('Load failed');

    const player = parseRedisHash<any>(playerRaw);
    player.hasDog = player.hasDog === 'true';
    player.dogActiveUntil = new Date(Number(player.dogActiveUntil));
    if (!player.avatar) player.avatar = "https://robohash.org/default.png?set=set1";
    if (!player.gold) player.gold = 0;

    const lands = [];
    for (let i = 1; i < results.length; i++) {
      const landRaw = results[i] as any;
      if (landRaw && Object.keys(landRaw).length > 0) {
        const land = parseRedisHash<any>(landRaw);
        lands.push({
          ...land,
          id: land.id || land.dbId,
          matureAt: Number(land.matureAt) > 0 ? new Date(Number(land.matureAt)).toISOString() : null,
          plantedAt: Number(land.plantedAt) > 0 ? new Date(Number(land.plantedAt)).toISOString() : null,
          remainingHarvests: Number(land.remainingHarvests || 0),
          hasWeeds: land.hasWeeds === 'true',
          hasPests: land.hasPests === 'true',
          needsWater: land.needsWater === 'true'
        });
      }
    }
    return { ...player, lands };
  }

  private static async tryTriggerDisasters(playerId: string) {
    const { PROB_WEED, PROB_PEST, PROB_WATER } = GAME_CONFIG.DISASTER;
    try {
      const res = await redisClient.eval(LUA_SCRIPTS.TRIGGER_EVENTS, {
        keys: [KEYS.PLAYER(playerId), KEYS.DIRTY_LANDS],
        arguments: [
          GAME_CONFIG.LAND.MAX_LIMIT.toString(),
          PROB_WEED.toString(),
          PROB_PEST.toString(),
          PROB_WATER.toString(),
          Date.now().toString(),
          DISASTER_CHECK_INTERVAL.toString()
        ]
      });
      // const affected = res as number[];
      // if (affected && affected.length > 0) {
      //   broadcast({
      //     type: 'action',
      //     action: 'DISASTER',
      //     playerId,
      //     details: 'Farm status updated!',
      //     data: {
      //       positions: affected,
      //       type: 'disaster'
      //     }
      //   }, false);
      // }
    } catch (e) { }
  }

  // ==========================================
  // 1. 种植
  // ==========================================
  static async plant(playerId: string, position: number, cropId: string) {
    await this.ensurePlayerLoaded(playerId);
    const playerName = await this.getPlayerName(playerId);

    const crop = CROPS.find(c => c.type === cropId);
    if (!crop) throw new Error('Invalid crop');

    const now = Date.now();
    const matureAt = now + (crop.matureTime * 1000);
    const maxHarvests = crop.maxHarvests || 1;
    const landKey = KEYS.LAND(playerId, position);
    const expGain = GAME_CONFIG.EXP_RATES.PLANT;
    const seedCost = crop.seedPrice;

    const requiredLevelIndex = GAME_CONFIG.LAND_LEVELS.indexOf(crop.requiredLandType as any);
    const safeLevelIndex = requiredLevelIndex === -1 ? 0 : requiredLevelIndex;

    const res = await redisClient.eval(LUA_SCRIPTS.PLANT, {
      keys: [landKey, KEYS.DIRTY_LANDS, KEYS.PLAYER(playerId), KEYS.DIRTY_PLAYERS],
      arguments: [
        crop.type,
        matureAt.toString(),
        now.toString(),
        maxHarvests.toString(),
        expGain.toString(),
        safeLevelIndex.toString(),
        seedCost.toString()
      ]
    });
    this.checkLuaError(res);

    const isLevelUp = (res as any)[1] === 'true';
    if (isLevelUp) {
      broadcast({
        type: 'action',
        action: 'LEVEL_UP',
        playerId,
        playerName, // Ensure playerName is passed if available
        details: 'Level Up!',
        data: { level: 'unknown' } // Lua doesn't return new level, might need to fetch or just notify
      }, false);
    }

    broadcast({
      type: 'action', action: 'PLANT', playerId, playerName,
      details: `Planted ${crop.name}`,
      data: {
        position,
        matureAt,
        cropId,
        cropName: crop.name,
        remainingHarvests: maxHarvests,
        expGain,
        level: requiredLevelIndex
      }
    });

    return { success: true, matureAt, expGain };
  }

  // ==========================================
  // 2. 收获
  // ==========================================
  static async harvest(playerId: string, position: number) {
    await this.ensurePlayerLoaded(playerId);
    const landKey = KEYS.LAND(playerId, position);

    const cropId = await redisClient.hGet(landKey, 'cropId');
    if (!cropId) throw new Error('No crop');

    const crop = CROPS.find(c => c.type === cropId);
    if (!crop) throw new Error('Invalid crop config');

    const baseGold = crop.sellPrice * (crop.yield || 1);
    const baseExp = crop.exp;
    const regrowTime = (crop.regrowTime || 0) * 1000;

    const { STEAL_PENALTY, HEALTH_PENALTY } = GAME_CONFIG.BASE_RATES;

    const res = await redisClient.eval(LUA_SCRIPTS.HARVEST, {
      keys: [landKey, KEYS.PLAYER(playerId), KEYS.DIRTY_LANDS, KEYS.DIRTY_PLAYERS],
      arguments: [
        baseGold.toString(),
        baseExp.toString(),
        Date.now().toString(),
        STEAL_PENALTY.toString(),
        HEALTH_PENALTY.toString(),
        (regrowTime / 1000).toString()
      ]
    });
    this.checkLuaError(res);

    const [finalGold, finalExp, finalRateStr, nextRemaining, isLevelUpStr, hasWeedsStr, hasPestsStr, needsWaterStr] = res as [number, number, string, number, string, string, string, string];

    const playerName = await this.getPlayerName(playerId);

    if (isLevelUpStr === 'true') {
      broadcast({ type: 'action', action: 'LEVEL_UP', playerId, playerName, details: 'Level Up!' }, false);
    }

    const hasWeeds = hasWeedsStr === 'true';
    const hasPests = hasPestsStr === 'true';
    const needsWater = needsWaterStr === 'true';
    let healthLoss = 0;

    // Calculate potential loss if there were weeds/pests
    // Note: This is an estimation for display. The actual deduction happened in Lua via rate.
    // Logic: baseGold * (1 - rate) is total loss.
    // We want specifically loss due to health.
    // If rate was reduced by HEALTH_PENALTY (0.2) for each issue.
    if (hasWeeds || hasPests || needsWater) {
      const penaltyCount = (hasWeeds ? 1 : 0) + (hasPests ? 1 : 0) + (needsWater ? 1 : 0);
      // Loss = BaseGold * (PenaltyRate * Count)
      healthLoss = Math.floor(baseGold * (HEALTH_PENALTY * penaltyCount));
    }

    broadcast({
      type: 'action', action: 'HARVEST', playerId, playerName,
      details: `Harvested ${crop.name}`,
      data: {
        position,
        gold: finalGold,
        exp: finalExp,
        quality: parseFloat(finalRateStr),
        cropId: crop.type,
        cropName: crop.name,
        remainingHarvests: nextRemaining,
        healthLoss: healthLoss > 0 ? healthLoss : undefined
      }
    });

    return { success: true, gold: finalGold, exp: finalExp, remainingHarvests: nextRemaining, healthLoss: healthLoss > 0 ? healthLoss : undefined };
  }

  // ==========================================
  // 3. [修复] 偷菜 - 返回完整结构
  // ==========================================
  static async steal(stealerId: string, victimId: string, position: number) {
    if (stealerId === victimId) throw new Error("Cannot steal self");
    await Promise.all([this.ensurePlayerLoaded(stealerId), this.ensurePlayerLoaded(victimId)]);

    const victimLandKey = KEYS.LAND(victimId, position);
    const cropId = await redisClient.hGet(victimLandKey, 'cropId');
    if (!cropId) throw new Error('Nothing to steal');

    const crop = CROPS.find(c => c.type === cropId);
    const stealAmount = Math.max(1, Math.floor((crop!.sellPrice || 10) * 0.1));

    const { CATCH_RATE, BITE_PENALTY } = GAME_CONFIG.DOG;

    try {
      const res = await redisClient.eval(LUA_SCRIPTS.STEAL, {
        keys: [
          victimLandKey,
          KEYS.PLAYER(stealerId),
          KEYS.LAND_THIEVES(victimId, position),
          KEYS.DIRTY_LANDS,
          KEYS.DIRTY_PLAYERS,
          KEYS.PLAYER(victimId)
        ],
        arguments: [
          stealerId,
          stealAmount.toString(),
          Date.now().toString(),
          '2',
          CATCH_RATE.toString(),
          BITE_PENALTY.toString()
        ]
      });

      this.checkLuaError(res);
      // Lua 成功返回的是 stolenCount，但我们不需要在这里用到它

      const [stealerName, victimName] = await Promise.all([
        this.getPlayerName(stealerId),
        this.getPlayerName(victimId)
      ]);

      broadcast({
        type: 'action',
        action: 'STEAL',
        playerId: stealerId,
        playerName: stealerName,
        details: `Stole from player`,
        data: {
          gold: stealAmount,
          victimId,
          victimName,
          cropId: crop!.type, // Add checks if needed, but crop should be defined here
          cropName: crop!.name,
          amount: 1
        }
      });

      broadcast({
        type: 'action',
        action: 'STOLEN',
        playerId: victimId,
        playerName: victimName,
        details: `Stolen by ${stealerName}`,
        data: {
          gold: -stealAmount,
          thiefId: stealerId,
          thiefName: stealerName,
          cropId: crop!.type,
          cropName: crop!.name,
          amount: 1
        }
      }, false);

      // [修复] 返回前端需要的完整数据结构
      return {
        success: true,
        stolen: {
          cropType: crop!.type,
          cropName: crop!.name,
          amount: 1, // 偷菜目前逻辑是按次计算，相当于“一捆”或“一份”
          goldValue: stealAmount
        }
      };

    } catch (e: any) {
      if (e.message === 'Bitten by dog') {
        const stealerName = await this.getPlayerName(stealerId);
        broadcast({
          type: 'action',
          action: 'DOG_BITE',
          playerId: stealerId,
          playerName: stealerName,
          details: `Bitten by dog! Lost ${BITE_PENALTY} gold.`,
          data: {
            penalty: BITE_PENALTY,
            victimId
          }
        });

        const victimName = await this.getPlayerName(victimId);
        broadcast({
          type: 'action',
          action: 'DOG_CATCH',
          playerId: victimId,
          playerName: victimName,
          details: `Dog caught ${stealerName}!`,
          data: {
            penalty: BITE_PENALTY,
            thiefId: stealerId,
            thiefName: stealerName
          }
        }, false);

        return { success: false, reason: 'bitten', penalty: BITE_PENALTY };
      }
      throw e;
    }
  }

  // ==========================================
  // 4. 照料
  // ==========================================
  static async care(operatorId: string, ownerId: string, position: number, type: 'water' | 'weed' | 'pest') {
    await Promise.all([this.ensurePlayerLoaded(operatorId), this.ensurePlayerLoaded(ownerId)]);
    const landKey = KEYS.LAND(ownerId, position);
    const fieldMap: Record<string, string> = { 'water': 'needsWater', 'weed': 'hasWeeds', 'pest': 'hasPests' };
    const field = fieldMap[type];
    const xpGain = GAME_CONFIG.EXP_RATES.CARE;
    const today = new Date().toISOString().split('T')[0];
    const dailyExpKey = `daily:exp:${today}:${operatorId}`;
    const res = await redisClient.eval(LUA_SCRIPTS.CARE, {
      keys: [landKey, KEYS.PLAYER(operatorId), KEYS.DIRTY_LANDS, KEYS.DIRTY_PLAYERS, dailyExpKey],
      arguments: [field, xpGain.toString(), MAX_DAILY_CARE_EXP.toString()]
    });
    this.checkLuaError(res);

    const [actualExpGain, isLevelUpStr] = res as [number, string];

    const operatorName = await this.getPlayerName(operatorId);

    if (isLevelUpStr === 'true') {
      broadcast({ type: 'action', action: 'LEVEL_UP', playerId: operatorId, playerName: operatorName, details: 'Level Up!' }, false);
    }

    broadcast({
      type: 'action',
      action: 'CARE',
      playerId: operatorId,
      playerName: operatorName,
      details: `Helped with ${type}`,
      data: {
        position,
        type,
        xpGain: actualExpGain,
        ownerId,
        ownerName: operatorId !== ownerId ? await this.getPlayerName(ownerId) : undefined
      }
    });

    if (operatorId !== ownerId) {
      broadcast({
        type: 'action',
        action: 'HELPED',
        playerId: ownerId,
        playerName: await this.getPlayerName(ownerId),
        details: `Farm tended by ${operatorName}`,
        data: {
          position,
          type,
          helperId: operatorId,
          helperName: operatorName
        }
      }, false);
    }
    return { success: true, xpGain: actualExpGain };
  }

  // ==========================================
  // 5. 铲除
  // ==========================================
  static async shovel(operatorId: string, ownerId: string, position: number) {
    if (operatorId === ownerId) {
      await this.ensurePlayerLoaded(operatorId);
    } else {
      await Promise.all([this.ensurePlayerLoaded(operatorId), this.ensurePlayerLoaded(ownerId)]);
    }

    const expGain = GAME_CONFIG.EXP_RATES.SHOVEL;

    // operatorId gets EXP, ownerId's land is cleared
    const res = await redisClient.eval(LUA_SCRIPTS.SHOVEL, {
      keys: [KEYS.LAND(ownerId, position), KEYS.DIRTY_LANDS, KEYS.PLAYER(operatorId), KEYS.DIRTY_PLAYERS],
      arguments: [expGain.toString(), (operatorId === ownerId).toString()]
    });
    this.checkLuaError(res);

    const operatorName = await this.getPlayerName(operatorId);

    const isLevelUp = (res as any)[1] === 'true';
    if (isLevelUp) {
      broadcast({ type: 'action', action: 'LEVEL_UP', playerId: operatorId, playerName: operatorName, details: 'Level Up!' }, false);
    }

    broadcast({
      type: 'action',
      action: 'SHOVEL',
      playerId: operatorId,
      playerName: operatorName,
      details: operatorId === ownerId ? 'Cleared land' : 'Helped clear land',
      data: {
        position,
        expGain,
        ownerId,
        ownerName: operatorId !== ownerId ? await this.getPlayerName(ownerId) : undefined
      }
    });

    if (operatorId !== ownerId) {
      broadcast({
        type: 'action',
        action: 'CLEARED',
        playerId: ownerId,
        playerName: await this.getPlayerName(ownerId),
        details: `Land cleared by ${operatorName}`,
        data: {
          position,
          helperId: operatorId,
          helperName: operatorName
        }
      }, false);
    }
    return { success: true, expGain };
  }

  // ... (upgradeLand, expandLand, useFertilizer, buyOrFeedDog 保持不变)
  static async upgradeLand(playerId: string, position: number) {
    await this.ensurePlayerLoaded(playerId);
    const landKey = KEYS.LAND(playerId, position);
    const currentType = await redisClient.hGet(landKey, 'landType') || 'normal';
    const upgradeConfig = GAME_CONFIG.LAND_UPGRADE[currentType as keyof typeof GAME_CONFIG.LAND_UPGRADE];
    if (!upgradeConfig || !upgradeConfig.next) throw new Error('Max level reached');
    const res = await redisClient.eval(LUA_SCRIPTS.UPGRADE_LAND, { keys: [landKey, KEYS.PLAYER(playerId), KEYS.DIRTY_LANDS, KEYS.DIRTY_PLAYERS], arguments: [upgradeConfig.price.toString(), upgradeConfig.next, upgradeConfig.levelReq.toString()] });
    this.checkLuaError(res);
    broadcast({
      type: 'action',
      action: 'UPGRADE_LAND',
      playerId,
      playerName: await this.getPlayerName(playerId),
      details: `Upgraded to ${upgradeConfig.next}`,
      data: {
        position,
        landType: upgradeConfig.next,
        cost: upgradeConfig.price
      }
    }, false);
    return { success: true, newType: upgradeConfig.next };
  }

  static async expandLand(playerId: string) {
    await this.ensurePlayerLoaded(playerId);

    // 1. 计算费用 (这里读一次 Redis 没关系，只是为了展示给用户或预判，实际扣费在 Lua)
    const countStr = await redisClient.hGet(KEYS.PLAYER(playerId), 'landCount');
    const currentCount = parseInt(countStr || '6');
    const cost = GAME_CONFIG.LAND.EXPAND_BASE_COST + (currentCount * 1000);

    // 2. 调用 Lua
    const res = await redisClient.eval(LUA_SCRIPTS.EXPAND_LAND, {
      keys: [
        KEYS.PLAYER(playerId),
        KEYS.DIRTY_PLAYERS,
        KEYS.DIRTY_LANDS
      ],
      arguments: [
        cost.toString(),
        GAME_CONFIG.LAND.MAX_LIMIT.toString(),
        playerId
      ]
    });

    this.checkLuaError(res);

    // Lua 返回 [newPos, newTotalCount]
    const [newPos, newTotal] = res as [number, number];

    broadcast({
      type: 'action',
      action: 'EXPAND_LAND',
      playerId,
      playerName: await this.getPlayerName(playerId),
      details: `Expanded farm`,
      data: {
        position: newPos,
        landCount: newTotal,
        cost
      }
    }, false);

    return { success: true, position: newPos, landCount: newTotal };
  }

  static async useFertilizer(playerId: string, position: number, type: 'normal' | 'high') {
    await this.ensurePlayerLoaded(playerId);
    const config = GAME_CONFIG.FERTILIZER[type];
    const res = await redisClient.eval(LUA_SCRIPTS.FERTILIZE, { keys: [KEYS.LAND(playerId, position), KEYS.PLAYER(playerId), KEYS.DIRTY_LANDS, KEYS.DIRTY_PLAYERS], arguments: [config.price.toString(), config.reduceSeconds.toString(), Date.now().toString()] });
    this.checkLuaError(res);
    const newMatureAt = (res as any)[0];
    broadcast({
      type: 'action',
      action: 'FERTILIZE',
      playerId,
      playerName: await this.getPlayerName(playerId),
      details: `Used fertilizer`,
      data: {
        position,
        matureAt: newMatureAt,
        type
      }
    });
    return { success: true, matureAt: newMatureAt };
  }

  static async buyOrFeedDog(playerId: string, isFeed: boolean = false) {
    await this.ensurePlayerLoaded(playerId);
    const { PRICE, FOOD_PRICE, FOOD_DURATION } = GAME_CONFIG.DOG;
    const price = isFeed ? FOOD_PRICE : PRICE;
    const res = await redisClient.eval(LUA_SCRIPTS.BUY_OR_FEED_DOG, { keys: [KEYS.PLAYER(playerId), KEYS.DIRTY_PLAYERS], arguments: [price.toString(), FOOD_DURATION.toString(), Date.now().toString(), isFeed ? 'true' : 'false'] });
    this.checkLuaError(res);
    broadcast({
      type: 'action',
      action: isFeed ? 'FEED_DOG' : 'BUY_DOG',
      playerId,
      playerName: await this.getPlayerName(playerId),
      details: isFeed ? 'Fed the dog' : 'Bought a dog',
      data: {
        price,
        isFeed
      }
    }, false);
    return { success: true };
  }

  private static checkLuaError(res: any) {
    if (res && typeof res === 'object' && res.err) throw new Error(res.err);
  }
}