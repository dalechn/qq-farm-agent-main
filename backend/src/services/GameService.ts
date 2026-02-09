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
      await redisClient.sAdd(KEYS.LEADERBOARD_DIRTY, playerId);
    } catch (e) {
      console.error(`Failed to mark rank dirty for ${playerId}`, e);
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

    // 1. Fetch from DB
    let player = null;
    let attempts = 0;
    while (!player && attempts < 3) {
      player = await prisma.player.findUnique({
        where: { id: playerId }
      });
      if (!player) {
        attempts++;
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!player) throw new Error('Player not found in database');

    // 2. Prepare Redis Transaction
    const pipeline = redisClient.multi();

    const currentLandCount = player.landCount || GAME_CONFIG.LAND.INITIAL_COUNT;

    // 3. Prepare Land Data (JSON)
    // [Refactor] 现在将所有土地存为一个 JSON 数组
    let rawLands = player.lands;
    if (!Array.isArray(rawLands)) {
      console.warn(`[Data Corruption] Player ${playerId} lands is not an array. Resetting to empty.`, rawLands);
      rawLands = [];
    }
    const savedLands = rawLands as unknown as LandData[];
    const landsToSave: LandData[] = [];

    for (let i = 0; i < currentLandCount; i++) {
      // Try to find saved land at this position
      const saved = savedLands.find(l => l.position === i);

      const landData: LandData = {
        id: i.toString(), // 兼容前端，实际存 position
        position: i,
        status: LandStatus.EMPTY,
        landType: 'normal',
        cropType: '', // 对应 cropId
        remainingHarvests: 0,
        stolenCount: 0,
        hasWeeds: false,
        hasPests: false,
        needsWater: false,
        matureAt: 0,
        plantedAt: 0
      };

      if (saved) {
        landData.status = saved.status || LandStatus.EMPTY;
        landData.landType = saved.landType || 'normal';
        landData.cropType = saved.cropType || '';
        landData.matureAt = Number(saved.matureAt || 0);
        landData.plantedAt = Number(saved.plantedAt || 0);
        landData.remainingHarvests = Number(saved.remainingHarvests || 0);
        landData.stolenCount = Number(saved.stolenCount || 0);
        landData.hasWeeds = !!saved.hasWeeds;
        landData.hasPests = !!saved.hasPests;
        landData.needsWater = !!saved.needsWater;
      }
      landsToSave.push(landData);
    }

    // A. Player Data (Merge lands into player hash)
    const playerData: Record<string, string> = {
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      gold: player.gold.toString(),
      exp: player.exp.toString(),
      level: player.level.toString(),
      landCount: currentLandCount.toString(),
      hasDog: player.hasDog ? 'true' : 'false',
      dogId: player.dogId || 'dog_1',
      dogActiveUntil: player.dogActiveUntil ? player.dogActiveUntil.getTime().toString() : '0',
      lastDisasterCheck: '0',
      lands: JSON.stringify(landsToSave) // [新增]
    };
    pipeline.hSet(playerKey, playerData);

    // [Refactor] 不再循环设置 KEYS.LAND

    pipeline.expire(playerKey, GAME_CONFIG.REDIS_PLAYER_CACHE_TTL || 3600);

    await pipeline.exec();

    // Update leaderboards
    updateLeaderboard('gold', player.id, player.gold);
    updateLeaderboard('level', player.id, player.level);
    updateLeaderboard('active', player.id, Date.now());
  }

  static async getPlayerState(playerId: string) {
    await this.ensurePlayerLoaded(playerId);

    // 灾难检查
    const lastCheckStr = await redisClient.hGet(KEYS.PLAYER(playerId), 'lastDisasterCheck');
    const lastCheck = parseInt(lastCheckStr || '0');
    const checkInterval = GAME_CONFIG.DISASTER_CHECK_INTERVAL || 60000;

    if (Date.now() - lastCheck > checkInterval) {
      await this.tryTriggerDisasters(playerId);
    }

    // [Refactor] 只读取 Player Hash
    const playerRaw = await redisClient.hGetAll(KEYS.PLAYER(playerId));
    if (!playerRaw || Object.keys(playerRaw).length === 0) throw new Error('Load failed');

    const player = parseRedisHash<any>(playerRaw);
    player.hasDog = player.hasDog === 'true';
    player.dogId = player.dogId || 'dog_1';
    player.dogActiveUntil = new Date(Number(player.dogActiveUntil));
    if (!player.gold) player.gold = 0;

    // 解析 Lands JSON
    let lands: any[] = [];
    try {
      lands = playerRaw.lands ? JSON.parse(playerRaw.lands) : [];
    } catch (e) {
      console.error(`Failed to parse lands for ${playerId}`, e);
      lands = [];
    }

    // 格式化输出给前端
    const formattedLands = lands.map((land: any) => ({
      ...land,
      id: land.position,
      matureAt: Number(land.matureAt) > 0 ? new Date(Number(land.matureAt)).toISOString() : null,
      plantedAt: Number(land.plantedAt) > 0 ? new Date(Number(land.plantedAt)).toISOString() : null,
      remainingHarvests: Number(land.remainingHarvests || 0),
      // JSON中已经是 boolean，无需 === 'true' 判断，但为了保险起见强制转一下
      hasWeeds: !!land.hasWeeds,
      hasPests: !!land.hasPests,
      needsWater: !!land.needsWater
    }));

    return { ...player, lands: formattedLands };
  }

  private static async tryTriggerDisasters(playerId: string) {
    const { PROB_WEED, PROB_PEST, PROB_WATER } = GAME_CONFIG.DISASTER;
    try {
      const landCount = await redisClient.hGet(KEYS.PLAYER(playerId), 'landCount') || '6';

      // [Refactor] Keys 只有 Player 和 Stream
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
    const expGain = GAME_CONFIG.EXP_RATES.PLANT;
    const seedCost = crop.seedPrice;

    const requiredLevelIndex = GAME_CONFIG.LAND_LEVELS.indexOf(crop.requiredLandType as any);
    const safeLevelIndex = requiredLevelIndex === -1 ? 0 : requiredLevelIndex;
    const requiredPlayerLevel = (crop as any).requiredLevel || 1;

    // [Refactor] Keys 变更: [PlayerKey, StreamKey]
    // Args 变更: position 在第一个
    const res = await redisClient.eval(LUA_SCRIPTS.PLANT, {
      keys: [KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS],
      arguments: [
        position.toString(),
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

    await this.syncPlayerRank(playerId);

    const isLevelUp = (res as any)[1] === 'true';
    if (isLevelUp) {
      broadcast({
        type: 'action', action: 'LEVEL_UP', playerId, playerName, details: 'Level Up!',
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
    // [Refactor] 必须先获取 cropId 才能查配置，这里从 getPlayerState 拿或者让 Lua 返回
    // 为了性能，我们先假设 Lua 里面会校验。但我们需要配置来算收益。
    // 方案：先读一次状态 (反正现在读全量很快)
    const state = await this.getPlayerState(playerId);
    const land = state.lands.find((l: any) => l.position === position);

    if (!land || land.status === 'empty' || !land.cropType) throw new Error('No crop');
    const cropId = land.cropType;

    const crop = CROPS.find(c => c.type === cropId);
    if (!crop) throw new Error('Invalid crop config');

    const baseGold = crop.sellPrice * (crop.yield || 1);
    const baseExp = crop.exp;
    const regrowTime = (crop.regrowTime || 0) * 1000;

    const { STEAL_PENALTY, HEALTH_PENALTY } = GAME_CONFIG.BASE_RATES;

    // [Refactor] Keys 变更: [PlayerKey, StreamKey]
    const res = await redisClient.eval(LUA_SCRIPTS.HARVEST, {
      keys: [KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS],
      arguments: [
        position.toString(),
        baseGold.toString(),
        baseExp.toString(),
        Date.now().toString(),
        STEAL_PENALTY.toString(),
        HEALTH_PENALTY.toString(),
        (regrowTime / 1000).toString()
      ]
    });
    this.checkLuaError(res);

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
  // 3. 偷菜
  // ==========================================
  static async steal(stealerId: string, victimId: string, position: number) {
    if (stealerId === victimId) throw new Error("Cannot steal self");
    await Promise.all([this.ensurePlayerLoaded(stealerId), this.ensurePlayerLoaded(victimId)]);

    // [Refactor] 读取 Victim 状态获取 crop 信息
    const state = await this.getPlayerState(victimId);
    const land = state.lands.find((l: any) => l.position === position);
    if (!land || !land.cropType) throw new Error('Nothing to steal');

    const cropId = land.cropType;
    const crop = CROPS.find(c => c.type === cropId);
    const stealAmount = Math.max(1, Math.floor((crop!.sellPrice || 10) * 0.1));

    // Dog info is now inside victim key logic in Lua, or passed parameters?
    // We'll let Lua read the victim player key for Dog info.
    const victimKey = KEYS.PLAYER(victimId);
    // 简单获取狗ID配置来计算几率，虽然 Lua 也会读，但这里 JS 需要传参给 Lua
    // 为了保持 Lua 接口一致性，我们在 Lua 内部读 Dog 属性会更好，但原来的 Lua 是传参进去的。
    // 我们先读出来。
    let dogId = await redisClient.hGet(victimKey, 'dogId');
    if (!dogId) dogId = 'dog_1';
    const dogConfig = GAME_CONFIG.DOG.find(d => d.id === dogId) || GAME_CONFIG.DOG[0];
    const { CATCH_RATE, BITE_PENALTY } = dogConfig;

    try {
      // [Refactor] Keys 变更:
      // KEYS[1]: Victim Player (包含 Lands 和 Dog)
      // KEYS[2]: Stealer Player
      // KEYS[3]: Thieves Set (保持独立的 Key)
      // KEYS[4]: Stream
      // KEYS[5]: Daily Steal
      const res = await redisClient.eval(LUA_SCRIPTS.STEAL, {
        keys: [
          KEYS.PLAYER(victimId),
          KEYS.PLAYER(stealerId),
          KEYS.LAND_THIEVES(victimId, position),
          KEYS.MQ_GAME_EVENTS,
          KEYS.DAILY_STEAL(stealerId)
        ],
        arguments: [
          stealerId,
          stealAmount.toString(),
          Date.now().toString(),
          GAME_CONFIG.MAX_STOLEN_PER_LAND.toString(),
          CATCH_RATE.toString(),
          BITE_PENALTY.toString(),
          GAME_CONFIG.MAX_DAILY_STEAL_GOLD.toString(),
          position.toString() // [新增]
        ]
      });

      this.checkLuaError(res);

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
        const actualPenalty = Number(e.penalty || 0);
        await this.syncPlayerRank(stealerId);
        await this.syncPlayerRank(victimId);

        const stealerName = await this.getPlayerName(stealerId);
        broadcast({
          type: 'action', action: 'DOG_BITE', playerId: stealerId, playerName: stealerName,
          details: `Bitten by dog! Lost ${actualPenalty} gold.`,
          data: { penalty: actualPenalty, victimId }
        });

        const victimName = await this.getPlayerName(victimId);
        broadcast({
          type: 'action', action: 'DOG_CATCH', playerId: victimId, playerName: victimName,
          details: `Dog caught ${stealerName}! Earned ${actualPenalty} gold.`,
          data: { penalty: actualPenalty, compensation: actualPenalty, thiefId: stealerId, thiefName: stealerName }
        }, false);

        return { success: false, reason: 'bitten', penalty: actualPenalty };
      }

      if (e.message === 'Daily steal limit reached') {
        const current = (e as any).current || 0;
        const limit = (e as any).limit || GAME_CONFIG.MAX_DAILY_STEAL_GOLD;
        return { success: false, reason: 'Daily steal limit reached', current, limit };
      }
      throw e;
    }
  }

  // ==========================================
  // 4. 照料
  // ==========================================
  static async care(operatorId: string, ownerId: string, position: number, type: 'water' | 'weed' | 'pest') {
    await Promise.all([this.ensurePlayerLoaded(operatorId), this.ensurePlayerLoaded(ownerId)]);

    const fieldMap: Record<string, string> = { 'water': 'needsWater', 'weed': 'hasWeeds', 'pest': 'hasPests' };
    const field = fieldMap[type];
    const xpGain = GAME_CONFIG.EXP_RATES.CARE;

    // [Refactor] Keys 变更:
    // KEYS[1]: Owner Player (Land)
    // KEYS[2]: Operator Player (XP)
    const res = await redisClient.eval(LUA_SCRIPTS.CARE, {
      keys: [
        KEYS.PLAYER(ownerId),
        KEYS.PLAYER(operatorId),
        KEYS.MQ_GAME_EVENTS,
        KEYS.DAILY_EXP(operatorId)
      ],
      arguments: [
        position.toString(),
        field,
        xpGain.toString(),
        GAME_CONFIG.MAX_DAILY_CARE_EXP.toString()
      ]
    });
    this.checkLuaError(res);

    await this.syncPlayerRank(operatorId);

    const [actualExpGain, isLevelUpStr] = res as [number, string];
    const operatorName = await this.getPlayerName(operatorId);

    if (isLevelUpStr === 'true') {
      broadcast({ type: 'action', action: 'LEVEL_UP', playerId: operatorId, playerName: operatorName, details: 'Level Up!' }, false);
    }

    broadcast({
      type: 'action', action: 'CARE', playerId: operatorId, playerName: operatorName,
      details: `Helped with ${type}`,
      data: {
        position, type, xpGain: actualExpGain,
        ownerId, ownerName: operatorId !== ownerId ? await this.getPlayerName(ownerId) : undefined
      }
    });

    if (operatorId !== ownerId) {
      broadcast({
        type: 'action', action: 'HELPED', playerId: ownerId,
        playerName: await this.getPlayerName(ownerId),
        details: `Farm tended by ${operatorName}`,
        data: { position, type, helperId: operatorId, helperName: operatorName }
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

    // [Refactor] Keys 变更: [Owner, Operator, Stream]
    const res = await redisClient.eval(LUA_SCRIPTS.SHOVEL, {
      keys: [KEYS.PLAYER(ownerId), KEYS.PLAYER(operatorId), KEYS.MQ_GAME_EVENTS],
      arguments: [
        position.toString(),
        expGain.toString(),
        (operatorId === ownerId).toString()
      ]
    });
    this.checkLuaError(res);

    await this.syncPlayerRank(operatorId);
    const operatorName = await this.getPlayerName(operatorId);

    const isLevelUp = (res as any)[1] === 'true';
    if (isLevelUp) {
      broadcast({ type: 'action', action: 'LEVEL_UP', playerId: operatorId, playerName: operatorName, details: 'Level Up!' }, false);
    }

    broadcast({
      type: 'action', action: 'SHOVEL', playerId: operatorId, playerName: operatorName,
      details: operatorId === ownerId ? 'Cleared land' : 'Helped clear land',
      data: {
        position, expGain, ownerId,
        ownerName: operatorId !== ownerId ? await this.getPlayerName(ownerId) : undefined
      }
    });

    if (operatorId !== ownerId) {
      broadcast({
        type: 'action', action: 'CLEARED', playerId: ownerId,
        playerName: await this.getPlayerName(ownerId),
        details: `Land cleared by ${operatorName}`,
        data: { position, helperId: operatorId, helperName: operatorName }
      }, false);
    }
    return { success: true, expGain };
  }

  static async upgradeLand(playerId: string, position: number) {
    await this.ensurePlayerLoaded(playerId);
    // 先读类型
    const state = await this.getPlayerState(playerId);
    const land = state.lands.find((l: any) => l.position === position);
    const currentType = land?.landType || 'normal';

    const upgradeConfig = GAME_CONFIG.LAND_UPGRADE[currentType as keyof typeof GAME_CONFIG.LAND_UPGRADE];
    if (!upgradeConfig || !upgradeConfig.next) throw new Error('Max level reached');

    // [Refactor] Keys: [Player, Stream]
    const res = await redisClient.eval(LUA_SCRIPTS.UPGRADE_LAND, {
      keys: [KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS],
      arguments: [
        position.toString(),
        upgradeConfig.price.toString(),
        upgradeConfig.next,
        upgradeConfig.levelReq.toString()
      ]
    });
    this.checkLuaError(res);

    await this.syncPlayerRank(playerId);

    broadcast({
      type: 'action', action: 'UPGRADE_LAND', playerId,
      playerName: await this.getPlayerName(playerId),
      details: `Upgraded to ${upgradeConfig.next}`,
      data: { position, landType: upgradeConfig.next, cost: upgradeConfig.price }
    }, false);
    return { success: true, newType: upgradeConfig.next };
  }

  static async expandLand(playerId: string) {
    await this.ensurePlayerLoaded(playerId);

    const countStr = await redisClient.hGet(KEYS.PLAYER(playerId), 'landCount');
    const currentCount = parseInt(countStr || '6');
    const cost = GAME_CONFIG.LAND.EXPAND_BASE_COST + (currentCount * 1000);

    const res = await redisClient.eval(LUA_SCRIPTS.EXPAND_LAND, {
      keys: [KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS],
      arguments: [
        cost.toString(),
        GAME_CONFIG.LAND.MAX_LIMIT.toString(),
        playerId
      ]
    });
    this.checkLuaError(res);

    await this.syncPlayerRank(playerId);

    const [newPos, newTotal] = res as [number, number];

    broadcast({
      type: 'action', action: 'EXPAND_LAND', playerId,
      playerName: await this.getPlayerName(playerId),
      details: `Expanded farm`,
      data: { position: newPos, landCount: newTotal, cost }
    }, false);

    return { success: true, position: newPos, landCount: newTotal };
  }

  static async useFertilizer(playerId: string, position: number, type: 'normal' | 'high') {
    await this.ensurePlayerLoaded(playerId);
    const config = GAME_CONFIG.FERTILIZER[type];
    const res = await redisClient.eval(LUA_SCRIPTS.FERTILIZE, {
      keys: [KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS],
      arguments: [
        position.toString(),
        config.price.toString(),
        config.reduceSeconds.toString(),
        Date.now().toString()
      ]
    });
    this.checkLuaError(res);

    await this.syncPlayerRank(playerId);

    const newMatureAt = (res as any)[0];
    broadcast({
      type: 'action', action: 'FERTILIZE', playerId,
      playerName: await this.getPlayerName(playerId),
      details: `Used fertilizer`,
      data: { position, matureAt: newMatureAt, type }
    });
    return { success: true, matureAt: newMatureAt };
  }

  static async buyOrFeedDog(playerId: string, isFeed: boolean = false, dogId: string = 'dog_1') {
    await this.ensurePlayerLoaded(playerId);
    let currentDogId = dogId;
    if (isFeed) {
      const ownedDogId = await redisClient.hGet(KEYS.PLAYER(playerId), 'dogId');
      if (ownedDogId) currentDogId = ownedDogId;
    }

    const dogConfig = GAME_CONFIG.DOG.find(d => d.id === currentDogId) || GAME_CONFIG.DOG[0];
    const { PRICE, FOOD_PRICE, FOOD_DURATION } = dogConfig;
    const price = isFeed ? FOOD_PRICE : PRICE;

    const res = await redisClient.eval(LUA_SCRIPTS.BUY_OR_FEED_DOG, {
      keys: [KEYS.PLAYER(playerId), KEYS.MQ_GAME_EVENTS],
      arguments: [
        price.toString(),
        FOOD_DURATION.toString(),
        Date.now().toString(),
        isFeed ? 'true' : 'false',
        dogId
      ]
    });
    this.checkLuaError(res);

    await this.syncPlayerRank(playerId);

    broadcast({
      type: 'action', action: isFeed ? 'FEED_DOG' : 'BUY_DOG', playerId,
      playerName: await this.getPlayerName(playerId),
      details: isFeed ? 'Fed the dog' : 'Bought a dog',
      data: { price, isFeed }
    }, false);
    return { success: true };
  }

  private static checkLuaError(res: any) {
    if (typeof res === 'string' && res.startsWith('{')) {
      try {
        const parsed = JSON.parse(res);
        if (parsed.err) {
          const error = new Error(parsed.err);
          Object.assign(error, parsed);
          throw error;
        }
      } catch (e: any) {
        if (e instanceof Error && (e as any).err) throw e;
      }
    }
    if (res && typeof res === 'object' && res.err) {
      const error = new Error(res.err);
      Object.assign(error, res);
      throw error;
    }
  }
}