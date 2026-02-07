// backend/src/services/GameService.ts

import { redisClient, KEYS, parseRedisHash, updateLeaderboard } from '../utils/redis';
import { LUA_SCRIPTS } from '../utils/lua-scripts';
import prisma from '../utils/prisma';
import { GAME_CONFIG, CROPS, LandStatus, LandData } from '../utils/game-keys';
import { broadcast } from '../utils/websocket';

export class GameService {

  // ==========================================
  // [新增] 同步排行榜辅助函数
  // ==========================================
  static async prewarmLeaderboards() {
    console.log('🔥 Pre-warming leaderboards...');
    const players = await prisma.player.findMany({ select: { id: true } });
    for (const player of players) {
      await this.ensurePlayerLoaded(player.id);
    }
    console.log(`✅ Leaderboards pre-warmed! (${players.length} players)`);
  }

  private static async syncPlayerRank(playerId: string) {
    try {
      // 从 Redis Hash 中读取最新的 gold 和 level
      const [goldStr, levelStr] = await redisClient.hmGet(KEYS.PLAYER(playerId), ['gold', 'level']);

      if (goldStr) {
        await updateLeaderboard('gold', playerId, Number(goldStr));
      }
      if (levelStr) {
        await updateLeaderboard('level', playerId, Number(levelStr));
      }
      // 每次同步都视为一次活跃
      await updateLeaderboard('active', playerId, Date.now());
    } catch (e) {
      console.error(`Failed to sync rank for ${playerId}`, e);
    }
  }

  // ==========================================
  // 缓存与加载逻辑
  // ==========================================

  private static async getPlayerName(playerId: string): Promise<string> {
    const name = await redisClient.hGet(KEYS.PLAYER(playerId), 'name');
    return name || 'Farmer';
  }

  private static async ensurePlayerLoaded(playerId: string) {
    const playerKey = KEYS.PLAYER(playerId);

    // Check if player exists in Redis
    if (await redisClient.exists(playerKey)) return;

    console.log(`[Cache] Miss for ${playerId}, loading from DB...`);

    // 1. Fetch from DB with Retry Logic (Fix for 500 error on fresh registration)
    let player = null;
    let attempts = 0;
    while (!player && attempts < 3) {
      player = await prisma.player.findUnique({
        where: { id: playerId }
        // 注意：如果是 JSON 字段，通常不需要 include，但为了保险起见（或如果是关系型），Prisma 默认行为即可
        // 如果之前因为 include 报错，可以去掉 include: { lands: true }
      });
      if (!player) {
        attempts++;
        await new Promise(r => setTimeout(r, 500)); // Wait 500ms before retry
      }
    }

    if (!player) throw new Error('Player not found in database');

    // 2. Prepare Redis Transaction (Atomic Write)
    const pipeline = redisClient.multi();

    const currentLandCount = player.landCount || GAME_CONFIG.LAND.INITIAL_COUNT;

    // A. Player Data
    const playerData: Record<string, string> = {
      id: player.id,
      name: player.name,
      gold: player.gold.toString(),
      exp: player.exp.toString(),
      level: player.level.toString(),
      avatar: player.avatar || "https://robohash.org/default.png?set=set1",
      twitter: player.twitter || '',
      createdAt: player.createdAt.toISOString(),
      landCount: currentLandCount.toString(),
      hasDog: player.hasDog ? 'true' : 'false',
      dogActiveUntil: player.dogActiveUntil ? player.dogActiveUntil.getTime().toString() : '0',
      lastDisasterCheck: '0'
    };
    pipeline.hSet(playerKey, playerData);

    // 3. Land Data
    // [Fix] 关键修复：确保 lands 是数组。如果 DB 存了坏数据（对象），这里会把它重置为空数组，避免 .find 报错
    let rawLands = player.lands;
    if (!Array.isArray(rawLands)) {
      console.warn(`[Data Corruption] Player ${playerId} lands is not an array. Resetting to empty.`, rawLands);
      rawLands = [];
    }
    const savedLands = rawLands as unknown as LandData[];

    for (let i = 0; i < currentLandCount; i++) {
      const landKey = KEYS.LAND(player.id, i);

      // Try to find saved land at this position
      const saved = savedLands.find(l => l.position === i);

      const landData: Record<string, string> = {
        id: i.toString(),
        position: i.toString(),
        status: LandStatus.EMPTY,
        landType: 'normal',
        cropId: '',
        remainingHarvests: '0',
        stolenCount: '0',
        hasWeeds: 'false',
        hasPests: 'false',
        needsWater: 'false',
        matureAt: '0',
        plantedAt: '0'
      };

      if (saved) {
        landData.status = saved.status || LandStatus.EMPTY;
        landData.landType = saved.landType || 'normal';
        landData.cropId = saved.cropType || '';
        landData.matureAt = saved.matureAt?.toString() || '0';
        landData.plantedAt = saved.plantedAt?.toString() || '0';
        landData.remainingHarvests = (saved.remainingHarvests || 0).toString();
        landData.stolenCount = (saved.stolenCount || 0).toString();
        landData.hasWeeds = saved.hasWeeds ? 'true' : 'false';
        landData.hasPests = saved.hasPests ? 'true' : 'false';
        landData.needsWater = saved.needsWater ? 'true' : 'false';
      }

      pipeline.hSet(landKey, landData);
    }

    pipeline.expire(playerKey, GAME_CONFIG.REDIS_PLAYER_CACHE_TTL || 3600);

    await pipeline.exec();

    // Update leaderboards
    updateLeaderboard('gold', player.id, player.gold);
    updateLeaderboard('level', player.id, player.level);
    updateLeaderboard('active', player.id, Date.now());
  }

  static async getPlayerState(playerId: string) {
    await this.ensurePlayerLoaded(playerId);
    await this.tryTriggerDisasters(playerId);

    const pipeline = redisClient.multi();
    pipeline.hGetAll(KEYS.PLAYER(playerId));
    const landCount = Number(await redisClient.hGet(KEYS.PLAYER(playerId), 'landCount') || 6);

    for (let i = 0; i < landCount; i++) {
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
          id: land.position, // 前端使用 position 作为 id
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
      // 获取当前土地上限
      const landCount = await redisClient.hGet(KEYS.PLAYER(playerId), 'landCount') || '6';

      await redisClient.eval(LUA_SCRIPTS.TRIGGER_EVENTS, {
        keys: [KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS],
        arguments: [
          landCount,
          PROB_WEED.toString(),
          PROB_PEST.toString(),
          PROB_WATER.toString(),
          Date.now().toString(),
          GAME_CONFIG.DISASTER_CHECK_INTERVAL.toString()
        ]
      });
    } catch (e) { console.error('Disaster trigger err', e); }
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
    const requiredPlayerLevel = (crop as any).requiredLevel || 1;

    const res = await redisClient.eval(LUA_SCRIPTS.PLANT, {
      keys: [landKey, KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS],
      arguments: [
        crop.type,
        matureAt.toString(),
        now.toString(),
        maxHarvests.toString(),
        expGain.toString(),
        safeLevelIndex.toString(),
        seedCost.toString(),
        requiredPlayerLevel.toString()
      ]
    });
    this.checkLuaError(res);

    // [同步] 更新排行榜 (消耗金币 + 可能升级)
    await this.syncPlayerRank(playerId);

    const isLevelUp = (res as any)[1] === 'true';
    if (isLevelUp) {
      broadcast({
        type: 'action',
        action: 'LEVEL_UP',
        playerId,
        playerName,
        details: 'Level Up!',
        data: { level: 'unknown' }
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
      keys: [landKey, KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS],
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

    // [同步] 更新排行榜 (增加金币 + 可能升级)
    await this.syncPlayerRank(playerId);

    const [finalGold, finalExp, finalRateStr, nextRemaining, isLevelUpStr, hasWeedsStr, hasPestsStr, needsWaterStr] = res as [number, number, string, number, string, string, string, string];

    const playerName = await this.getPlayerName(playerId);

    if (isLevelUpStr === 'true') {
      broadcast({ type: 'action', action: 'LEVEL_UP', playerId, playerName, details: 'Level Up!' }, false);
    }

    const hasWeeds = hasWeedsStr === 'true';
    const hasPests = hasPestsStr === 'true';
    const needsWater = needsWaterStr === 'true';
    let healthLoss = 0;

    if (hasWeeds || hasPests || needsWater) {
      const penaltyCount = (hasWeeds ? 1 : 0) + (hasPests ? 1 : 0) + (needsWater ? 1 : 0);
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
  // 3. [修复] 偷菜
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
          KEYS.MQ_GAME_EVENTS,
          KEYS.PLAYER(victimId),
          KEYS.DAILY_STEAL(stealerId)
        ],
        arguments: [
          stealerId,
          stealAmount.toString(),
          Date.now().toString(),
          GAME_CONFIG.MAX_STOLEN_PER_LAND.toString(),
          CATCH_RATE.toString(),
          BITE_PENALTY.toString(),
          GAME_CONFIG.MAX_DAILY_STEAL_GOLD.toString()
        ]
      });

      this.checkLuaError(res);

      // [同步] 更新排行榜：偷菜者金币增加，(受害者金币不变，只在收获时结算减少，但狗咬会扣钱)
      // Lua 脚本里 STEAL 操作本身不会扣除受害者的金币，只是标记 stolenCount，受害者损失是在 Harvest 时计算。
      // 但是如果被狗咬了，偷窃者会扣钱。
      await this.syncPlayerRank(stealerId);

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
          cropId: crop!.type,
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

      return {
        success: true,
        stolen: {
          cropType: crop!.type,
          cropName: crop!.name,
          amount: 1,
          goldValue: stealAmount
        }
      };

    } catch (e: any) {
      if (e.message === 'Bitten by dog') {
        // 狗咬了，扣钱了，更新排行榜
        await this.syncPlayerRank(stealerId);

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

      if (e.message === 'Daily steal limit reached') {
        const current = (e as any).current || 0;
        const limit = (e as any).limit || GAME_CONFIG.MAX_DAILY_STEAL_GOLD;
        return {
          success: false,
          reason: 'Daily steal limit reached',
          current,
          limit
        };
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
    const res = await redisClient.eval(LUA_SCRIPTS.CARE, {
      keys: [landKey, KEYS.PLAYER(operatorId), KEYS.MQ_GAME_EVENTS, KEYS.DAILY_EXP(operatorId)],
      arguments: [field, xpGain.toString(), GAME_CONFIG.MAX_DAILY_CARE_EXP.toString()]
    });
    this.checkLuaError(res);

    // [同步] 更新排行榜 (增加经验，可能升级)
    await this.syncPlayerRank(operatorId);

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

    const res = await redisClient.eval(LUA_SCRIPTS.SHOVEL, {
      keys: [KEYS.LAND(ownerId, position), KEYS.PLAYER(operatorId), KEYS.MQ_GAME_EVENTS],
      arguments: [expGain.toString(), (operatorId === ownerId).toString()]
    });
    this.checkLuaError(res);

    // [同步]
    await this.syncPlayerRank(operatorId);

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

  // ... (upgradeLand, expandLand, useFertilizer, buyOrFeedDog)
  static async upgradeLand(playerId: string, position: number) {
    await this.ensurePlayerLoaded(playerId);
    const landKey = KEYS.LAND(playerId, position);
    const currentType = await redisClient.hGet(landKey, 'landType') || 'normal';
    const upgradeConfig = GAME_CONFIG.LAND_UPGRADE[currentType as keyof typeof GAME_CONFIG.LAND_UPGRADE];
    if (!upgradeConfig || !upgradeConfig.next) throw new Error('Max level reached');
    const res = await redisClient.eval(LUA_SCRIPTS.UPGRADE_LAND, { keys: [landKey, KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS], arguments: [upgradeConfig.price.toString(), upgradeConfig.next, upgradeConfig.levelReq.toString()] });
    this.checkLuaError(res);

    await this.syncPlayerRank(playerId); // 消耗金币

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

    const countStr = await redisClient.hGet(KEYS.PLAYER(playerId), 'landCount');
    const currentCount = parseInt(countStr || '6');
    const cost = GAME_CONFIG.LAND.EXPAND_BASE_COST + (currentCount * 1000);

    const res = await redisClient.eval(LUA_SCRIPTS.EXPAND_LAND, {
      keys: [
        KEYS.PLAYER(playerId),
        KEYS.MQ_GAME_EVENTS
      ],
      arguments: [
        cost.toString(),
        GAME_CONFIG.LAND.MAX_LIMIT.toString(),
        playerId
      ]
    });

    this.checkLuaError(res);

    await this.syncPlayerRank(playerId); // 消耗金币

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
    const res = await redisClient.eval(LUA_SCRIPTS.FERTILIZE, { keys: [KEYS.LAND(playerId, position), KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS], arguments: [config.price.toString(), config.reduceSeconds.toString(), Date.now().toString()] });
    this.checkLuaError(res);

    await this.syncPlayerRank(playerId); // 消耗金币

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
    const res = await redisClient.eval(LUA_SCRIPTS.BUY_OR_FEED_DOG, { keys: [KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS], arguments: [price.toString(), FOOD_DURATION.toString(), Date.now().toString(), isFeed ? 'true' : 'false'] });
    this.checkLuaError(res);

    await this.syncPlayerRank(playerId); // 消耗金币

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