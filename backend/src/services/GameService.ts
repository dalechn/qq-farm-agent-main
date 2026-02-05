// backend/src/services/GameService.ts

import prisma from '../utils/prisma';
import { updateLeaderboard } from '../utils/redis';
import { GAME_CONFIG } from '../config/game-keys';

const LAND_LIMIT = GAME_CONFIG.LAND.MAX_LIMIT;
const LAND_LEVELS = GAME_CONFIG.LAND_LEVELS;
const LAND_UPGRADE_CONFIG = GAME_CONFIG.LAND_UPGRADE;
const FERTILIZER_CONFIG = GAME_CONFIG.FERTILIZER;
const BASE_RATES = GAME_CONFIG.BASE_RATES;
const LAND_EXPAND_BASE_COST = GAME_CONFIG.LAND.EXPAND_BASE_COST;
const DOG_CONFIG = GAME_CONFIG.DOG; // [新增] 引入狗的配置

export class GameService {
  
  // 获取玩家状态
  static async getPlayerState(playerId: string) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { lands: { orderBy: { position: 'asc' } } }
    });
    
    if (!player) return null;

    const now = new Date();
    
    // 遍历所有土地进行状态“补算”
    const updatedLands = await Promise.all(player.lands.map(async (land) => {
      let needsUpdate = false;
      let updateData: any = {};
      
      // 1. 检查成熟
      if (land.status === 'planted' && land.matureAt && land.matureAt <= now) {
        updateData.status = 'harvestable';
        needsUpdate = true;
      }

      // 2. 惰性计算灾害
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
          if (!land.lastCalculatedAt || (now.getTime() - new Date(land.lastCalculatedAt).getTime() > 60000)) {
             updateData.lastCalculatedAt = now;
             needsUpdate = true;
          }
      }

      if (needsUpdate) {
        return await prisma.land.update({
          where: { id: land.id },
          data: updateData
        });
      }
      return land;
    }));

    return { ...player, lands: updatedLands };
  }

  // 种植
  static async plant(playerId: string, position: number, cropType: string) {
    const crop = await prisma.crop.findUnique({ where: { type: cropType } });
    if (!crop) throw new Error('Crop not found');

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player || player.gold < crop.seedPrice) throw new Error('Insufficient gold');

    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });
    
    if (!land || land.status !== 'empty') throw new Error('Land not available');

    const landLevelIndex = LAND_LEVELS.indexOf(land.landType as any);
    const reqLevelIndex = LAND_LEVELS.indexOf(crop.requiredLandType as any);

    if (landLevelIndex < reqLevelIndex) {
        throw new Error(`This crop requires ${crop.requiredLandType} soil or better.`);
    }

    const now = new Date();
    const matureAt = new Date(now.getTime() + crop.matureTime * 1000);

    const [updatedPlayer, updatedLand] = await prisma.$transaction([
      prisma.player.update({
        where: { id: playerId },
        data: { gold: { decrement: crop.seedPrice } }
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
    return updatedLand;
  }

  // 照料
  static async care(operatorId: string, ownerId: string, position: number, type: 'water' | 'weed' | 'pest') {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId: ownerId, position } }
    });

    if (!land) throw new Error('Land not found');
    if (land.status !== 'planted') {
      throw new Error('Can only care for growing crops');
    }

    let updateData: any = {};
    const expReward = 10; 

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

    const [updatedLand, updatedOperator] = await prisma.$transaction([
      prisma.land.update({
        where: { id: land.id },
        data: updateData
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

    return { success: true, exp: expReward, land: updatedLand };
  }

  // 收获
  static async harvest(playerId: string, position: number) {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });

    if (!land || land.status !== 'harvestable' || !land.cropType) {
      throw new Error('Nothing to harvest');
    }

    const crop = await prisma.crop.findUnique({ where: { type: land.cropType } });
    if (!crop) throw new Error('Crop config missing');

    const baseYield = Math.max(1, crop.yield - land.stolenCount);
    
    let penaltyRate = 0;
    if (land.hasWeeds) penaltyRate += 0.20;
    if (land.hasPests) penaltyRate += 0.30;
    if (land.needsWater) penaltyRate += 0.20;
    penaltyRate = Math.min(0.9, penaltyRate);

    const grossIncome = crop.sellPrice * baseYield;
    const penaltyAmount = Math.floor(grossIncome * penaltyRate);
    const netIncome = Math.max(0, grossIncome - penaltyAmount);
    const rewardExp = crop.exp;

    const updatedPlayer = await prisma.player.update({
      where: { id: playerId },
      data: {
        gold: { increment: netIncome },
        exp: { increment: rewardExp }
      }
    });
    
    updateLeaderboard('gold', playerId, updatedPlayer.gold).catch(console.error);
    const newLevel = Math.floor(Math.sqrt(updatedPlayer.exp / 10)) + 1;
    if (newLevel !== updatedPlayer.level) {
        await prisma.player.update({ where: { id: playerId }, data: { level: newLevel } });
        updateLeaderboard('level', playerId, newLevel).catch(console.error);
    }

    let newLandStatus = 'empty';
    let newMatureAt = null;
    let newRemainingHarvests = land.remainingHarvests - 1;
    const now = new Date();
    
    if (newRemainingHarvests > 0) {
        newLandStatus = 'planted';
        newMatureAt = new Date(now.getTime() + crop.regrowTime * 1000);
    } else {
        newLandStatus = 'withered';
        newRemainingHarvests = 0;
    }

    await prisma.land.update({
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
    });

    return { 
        gold: netIncome, 
        exp: rewardExp, 
        penalty: penaltyAmount, 
        nextSeason: newRemainingHarvests > 0,
        isWithered: newRemainingHarvests === 0
    };
  }

  // 铲除
  static async shovel(operatorId: string, ownerId: string, position: number) {
    const land = await prisma.land.findUnique({
        where: { playerId_position: { playerId: ownerId, position } }
    });

    if (!land || land.status !== 'withered') {
        throw new Error('Nothing to shovel');
    }

    const expReward = 15; 
    const now = new Date();

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

    return { success: true, exp: expReward, land: updatedLand };
  }

  // 扩建土地
  static async expandLand(playerId: string) {
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

    return { success: true, newPosition, cost: expandCost };
  }

  // 升级土地
  static async upgradeLand(playerId: string, position: number) {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });
    if (!land) throw new Error('Land not found');

    const config = LAND_UPGRADE_CONFIG[land.landType as keyof typeof LAND_UPGRADE_CONFIG];
    if (!config || !config.next) throw new Error('Max level reached');

    const player = await prisma.player.findUnique({ where: { id: playerId } });
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

    return { success: true, land: updatedLand };
  }

  // [修改] 使用化肥：改为直接扣金币，移除库存检查
  static async useFertilizer(playerId: string, position: number, type: 'normal' | 'high') {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });

    if (!land || land.status !== 'planted') throw new Error('Can only fertilize growing crops');
    if (!land.matureAt) throw new Error('Crop is not growing (matureAt is null)');

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Player not found');
    
    // 1. 获取化肥配置
    const config = FERTILIZER_CONFIG[type];
    if (!config) throw new Error('Invalid fertilizer type');

    // 2. 检查金币是否足够
    if (player.gold < config.price) {
        throw new Error(`Insufficient gold. Need ${config.price}`);
    }

    const reduceSeconds = config.reduceSeconds;
    
    // 3. 计算新的成熟时间
    const currentMatureAt = new Date(land.matureAt);
    const newMatureAt = new Date(currentMatureAt.getTime() - reduceSeconds * 1000);

    // 4. 数据库更新：扣金币 + 减时间
    await prisma.$transaction([
      prisma.player.update({
        where: { id: playerId },
        data: { 
            gold: { decrement: config.price } // 直接扣金币
        }
      }),
      prisma.land.update({
        where: { id: land.id },
        data: { matureAt: newMatureAt }
      })
    ]);

    return { success: true, newMatureAt, type, cost: config.price };
  }

  // [新增] 买狗
  static async buyDog(playerId: string) {
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Player not found');
    if (player.hasDog) throw new Error('You already have a dog');
    if (player.gold < DOG_CONFIG.PRICE) throw new Error(`Insufficient gold. Need ${DOG_CONFIG.PRICE}`);

    await prisma.player.update({
      where: { id: playerId },
      data: {
        gold: { decrement: DOG_CONFIG.PRICE },
        hasDog: true,
        dogActiveUntil: new Date() // 买来默认需要喂食
      }
    });

    return { success: true };
  }

  // [新增] 喂狗
  static async feedDog(playerId: string) {
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Player not found');
    if (!player.hasDog) throw new Error('You do not own a dog');
    if (player.gold < DOG_CONFIG.FOOD_PRICE) throw new Error(`Insufficient gold. Need ${DOG_CONFIG.FOOD_PRICE}`);

    const now = new Date();
    const currentActive = player.dogActiveUntil && player.dogActiveUntil > now 
      ? player.dogActiveUntil 
      : now;
    
    const newActiveUntil = new Date(currentActive.getTime() + DOG_CONFIG.FOOD_DURATION * 1000);

    await prisma.player.update({
      where: { id: playerId },
      data: {
        gold: { decrement: DOG_CONFIG.FOOD_PRICE },
        dogActiveUntil: newActiveUntil
      }
    });

    return { success: true, activeUntil: newActiveUntil };
  }
}