// src/services/GameService.ts

import { redisClient, KEYS, parseRedisHash } from '../utils/redis';
import { LUA_SCRIPTS } from '../utils/lua-scripts';
import prisma from '../utils/prisma';
import { GAME_CONFIG, CROPS } from '../utils/game-keys';
import { broadcast } from '../utils/websocket';

// 每日照料获取经验上限
const MAX_DAILY_CARE_EXP = 1000;
// 灾害检查间隔 (5分钟)
const DISASTER_CHECK_INTERVAL = 5 * 60 * 1000; 

export class GameService {

  // ==========================================
  // 缓存与加载逻辑
  // ==========================================

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
      landCount: player.lands.length.toString(),
      hasDog: player.hasDog ? 'true' : 'false',
      dogActiveUntil: player.dogActiveUntil ? player.dogActiveUntil.getTime().toString() : '0',
      // 初始化检查时间，设为0可以让玩家上线立即有概率触发，设为now则有保护期
      lastDisasterCheck: '0' 
    };
    await redisClient.hSet(playerKey, playerData);

    for (const land of player.lands) {
      const landKey = KEYS.LAND(player.id, land.position);
      const landData: Record<string, string> = {
        dbId: land.id.toString(),
        position: land.position.toString(),
        status: land.status,
        landType: land.landType,
        cropId: land.cropId || '',
        matureAt: land.matureAt ? land.matureAt.getTime().toString() : '0',
        plantedAt: land.plantedAt ? land.plantedAt.getTime().toString() : '0',
        stolenCount: land.stolenCount.toString(),
        hasWeeds: land.hasWeeds ? 'true' : 'false',
        hasPests: land.hasPests ? 'true' : 'false',
        needsWater: land.needsWater ? 'true' : 'false'
      };
      await redisClient.hSet(landKey, landData);
    }
    
    await redisClient.expire(playerKey, 86400 * 3);
  }

  // ==========================================
  // [修改] 获取状态时触发灾害检查
  // ==========================================
  static async getPlayerState(playerId: string) {
    await this.ensurePlayerLoaded(playerId);

    // 1. 尝试触发自然灾害 (Lazy Load)
    // 只有当超过间隔时间时，Lua 才会真正执行，非常轻量
    await this.tryTriggerDisasters(playerId);

    // 2. 获取数据 (灾害触发后的最新状态)
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

    const lands = [];
    for (let i = 1; i < results.length; i++) {
      const landRaw = results[i] as any;
      if (landRaw && Object.keys(landRaw).length > 0) {
        const land = parseRedisHash<any>(landRaw);
        lands.push({
          ...land,
          matureAt: Number(land.matureAt) > 0 ? new Date(Number(land.matureAt)).toISOString() : null,
          plantedAt: Number(land.plantedAt) > 0 ? new Date(Number(land.plantedAt)).toISOString() : null,
          hasWeeds: land.hasWeeds === 'true',
          hasPests: land.hasPests === 'true',
          needsWater: land.needsWater === 'true'
        });
      }
    }

    return { player, lands };
  }

  /**
   * [私有] 尝试触发自然灾害
   * 采用 Lua 脚本进行原子检查和生成
   */
  private static async tryTriggerDisasters(playerId: string) {
    const PROB_WEED = 10;  // 10% 概率
    const PROB_PEST = 10;  
    const PROB_WATER = 20; 

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

      const affected = res as number[];
      if (affected && affected.length > 0) {
        // 如果有地块受影响，广播通知 (前端可以弹个窗或者飘字)
        broadcast({
          type: 'action',
          action: 'DISASTER',
          playerId,
          details: 'Disaster struck!',
          data: { positions: affected }
        });
      }
    } catch (e) {
      console.error('Failed to trigger disasters:', e);
      // 失败不影响主流程
    }
  }

  // ==========================================
  // 核心玩法 (保持不变)
  // ==========================================

  static async plant(playerId: string, playerName: string, position: number, cropId: string) {
    await this.ensurePlayerLoaded(playerId);

    const crop = CROPS.find(c => c.type === cropId);
    if (!crop) throw new Error('Invalid crop');

    const now = Date.now();
    const matureAt = now + (crop.matureTime * 1000);
    const landKey = KEYS.LAND(playerId, position);

    const res = await redisClient.eval(LUA_SCRIPTS.PLANT, {
      keys: [landKey, KEYS.DIRTY_LANDS],
      arguments: [crop.type, matureAt.toString(), now.toString()]
    });
    this.checkLuaError(res);

    broadcast({
      type: 'action', action: 'PLANT', playerId, playerName,
      details: `Planted ${crop.name}`,
      data: { position, matureAt, cropId }
    });

    return { success: true, matureAt };
  }

  static async harvest(playerId: string, position: number) {
    await this.ensurePlayerLoaded(playerId);
    const landKey = KEYS.LAND(playerId, position);
    
    const cropId = await redisClient.hGet(landKey, 'cropId');
    if (!cropId) throw new Error('No crop');
    
    const crop = CROPS.find(c => c.type === cropId);
    if (!crop) throw new Error('Invalid crop config');

    const baseGold = crop.sellPrice * (crop.yield || 1);
    const baseExp = crop.exp;
    const STEAL_PENALTY = 0.1; 
    const HEALTH_PENALTY = 0.2;

    const res = await redisClient.eval(LUA_SCRIPTS.HARVEST, {
      keys: [landKey, KEYS.PLAYER(playerId), KEYS.DIRTY_LANDS, KEYS.DIRTY_PLAYERS],
      arguments: [
        baseGold.toString(),
        baseExp.toString(),
        Date.now().toString(),
        STEAL_PENALTY.toString(),
        HEALTH_PENALTY.toString()
      ]
    });
    this.checkLuaError(res);

    const [finalGold, finalExp, finalRateStr] = res as [number, number, string];

    broadcast({
      type: 'action', action: 'HARVEST', playerId,
      details: `Harvested ${crop.name}`,
      data: { position, gold: finalGold, exp: finalExp, quality: parseFloat(finalRateStr) }
    });

    return { success: true, gold: finalGold, exp: finalExp };
  }

  static async steal(stealerId: string, victimId: string, position: number) {
    if (stealerId === victimId) throw new Error("Cannot steal self");
    await Promise.all([this.ensurePlayerLoaded(stealerId), this.ensurePlayerLoaded(victimId)]);

    const victimLandKey = KEYS.LAND(victimId, position);
    const cropId = await redisClient.hGet(victimLandKey, 'cropId');
    if (!cropId) throw new Error('Nothing to steal');
    
    const crop = CROPS.find(c => c.type === cropId);
    const stealAmount = Math.max(1, Math.floor((crop!.sellPrice || 10) * 0.1));

    const res = await redisClient.eval(LUA_SCRIPTS.STEAL, {
      keys: [
        victimLandKey, 
        KEYS.PLAYER(stealerId), 
        KEYS.LAND_THIEVES(victimId, position), 
        KEYS.DIRTY_LANDS, 
        KEYS.DIRTY_PLAYERS,
        KEYS.PLAYER(victimId)
      ],
      arguments: [stealerId, stealAmount.toString(), Date.now().toString(), '2']
    });
    this.checkLuaError(res);

    broadcast({
      type: 'action', action: 'STEAL', playerId: stealerId,
      details: `Stole from player`, data: { gold: stealAmount }
    });

    return { success: true, stolenGold: stealAmount };
  }

  static async care(operatorId: string, ownerId: string, position: number, type: 'water' | 'weed' | 'pest') {
    await Promise.all([this.ensurePlayerLoaded(operatorId), this.ensurePlayerLoaded(ownerId)]);

    const landKey = KEYS.LAND(ownerId, position);
    const fieldMap: Record<string, string> = { 'water': 'needsWater', 'weed': 'hasWeeds', 'pest': 'hasPests' };
    const field = fieldMap[type];
    const xpGain = 10;
    
    const today = new Date().toISOString().split('T')[0];
    const dailyExpKey = `daily:exp:${today}:${operatorId}`;

    const res = await redisClient.eval(LUA_SCRIPTS.CARE, {
      keys: [
        landKey, 
        KEYS.PLAYER(operatorId), 
        KEYS.DIRTY_LANDS, 
        KEYS.DIRTY_PLAYERS, 
        dailyExpKey
      ],
      arguments: [field, xpGain.toString(), MAX_DAILY_CARE_EXP.toString()]
    });
    this.checkLuaError(res);

    const [actualExpGain] = res as [number];

    broadcast({
      type: 'action', action: 'CARE', playerId: operatorId,
      details: `Helped with ${type}`, 
      data: { position, type, xpGain: actualExpGain } 
    });

    return { success: true, xpGain: actualExpGain };
  }

  static async shovel(playerId: string, position: number) {
    await this.ensurePlayerLoaded(playerId);
    const res = await redisClient.eval(LUA_SCRIPTS.SHOVEL, {
      keys: [KEYS.LAND(playerId, position), KEYS.DIRTY_LANDS],
      arguments: []
    });
    this.checkLuaError(res);

    broadcast({ type: 'action', action: 'SHOVEL', playerId, details: 'Cleared land', data: { position } });
    return { success: true };
  }

  static async upgradeLand(playerId: string, position: number) {
    await this.ensurePlayerLoaded(playerId);
    const landKey = KEYS.LAND(playerId, position);
    
    const currentType = await redisClient.hGet(landKey, 'landType') || 'normal';
    const upgradeConfig = GAME_CONFIG.LAND_UPGRADE[currentType as keyof typeof GAME_CONFIG.LAND_UPGRADE];

    if (!upgradeConfig || !upgradeConfig.next) throw new Error('Max level reached');

    const res = await redisClient.eval(LUA_SCRIPTS.UPGRADE_LAND, {
      keys: [landKey, KEYS.PLAYER(playerId), KEYS.DIRTY_LANDS, KEYS.DIRTY_PLAYERS],
      arguments: [upgradeConfig.price.toString(), upgradeConfig.next, upgradeConfig.levelReq.toString()]
    });
    this.checkLuaError(res);

    broadcast({
      type: 'action', action: 'UPGRADE_LAND', playerId,
      details: `Upgraded to ${upgradeConfig.next}`, data: { position, landType: upgradeConfig.next }
    });
    return { success: true, newType: upgradeConfig.next };
  }

  static async expandLand(playerId: string) {
    await this.ensurePlayerLoaded(playerId);
    
    const countStr = await redisClient.hGet(KEYS.PLAYER(playerId), 'landCount');
    const currentCount = parseInt(countStr || '6');
    const cost = GAME_CONFIG.LAND.EXPAND_BASE_COST + (currentCount * 1000);
    const newPos = currentCount;

    const res = await redisClient.eval(LUA_SCRIPTS.EXPAND_LAND, {
      keys: [KEYS.PLAYER(playerId), KEYS.LAND(playerId, newPos), KEYS.DIRTY_PLAYERS, KEYS.DIRTY_LANDS],
      arguments: [cost.toString(), GAME_CONFIG.LAND.MAX_LIMIT.toString(), `${playerId}:${newPos}`]
    });
    this.checkLuaError(res);

    broadcast({
      type: 'action', action: 'EXPAND_LAND', playerId,
      details: `Expanded farm`, data: { position: newPos, landCount: currentCount + 1 }
    });
    return { success: true, position: newPos };
  }

  static async useFertilizer(playerId: string, position: number, type: 'normal' | 'high') {
    await this.ensurePlayerLoaded(playerId);
    const config = GAME_CONFIG.FERTILIZER[type];
    
    const res = await redisClient.eval(LUA_SCRIPTS.FERTILIZE, {
      keys: [KEYS.LAND(playerId, position), KEYS.PLAYER(playerId), KEYS.DIRTY_LANDS, KEYS.DIRTY_PLAYERS],
      arguments: [config.price.toString(), config.reduceSeconds.toString(), Date.now().toString()]
    });
    this.checkLuaError(res);

    const newMatureAt = (res as any)[0];
    broadcast({
      type: 'action', action: 'FERTILIZE', playerId,
      details: `Used fertilizer`, data: { position, matureAt: newMatureAt }
    });
    return { success: true, matureAt: newMatureAt };
  }

  static async buyOrFeedDog(playerId: string, isFeed: boolean = false) {
    await this.ensurePlayerLoaded(playerId);
    const { PRICE, FOOD_PRICE, FOOD_DURATION } = GAME_CONFIG.DOG;
    const price = isFeed ? FOOD_PRICE : PRICE;

    const res = await redisClient.eval(LUA_SCRIPTS.BUY_OR_FEED_DOG, {
      keys: [KEYS.PLAYER(playerId), KEYS.DIRTY_PLAYERS],
      arguments: [price.toString(), FOOD_DURATION.toString(), Date.now().toString(), isFeed ? 'true' : 'false']
    });
    this.checkLuaError(res);

    broadcast({
      type: 'action', action: isFeed ? 'FEED_DOG' : 'BUY_DOG', playerId,
      details: isFeed ? 'Fed the dog' : 'Bought a dog'
    });
    return { success: true };
  }

  private static checkLuaError(res: any) {
    if (res && typeof res === 'object' && res.err) throw new Error(res.err);
  }
}