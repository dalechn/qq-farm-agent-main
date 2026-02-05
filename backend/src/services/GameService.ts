// backend/src/services/GameService.ts

import prisma from '../utils/prisma';
import { updateLeaderboard } from '../utils/redis';

// 基础概率配置 (每分钟发生的几率)
const BASE_RATES = {
  WEED: 1,  // 5%
  PEST: 1,  // 3%
  WATER: 1  // 4%
};

export class GameService {
  
  // 获取玩家状态（惰性计算核心逻辑）
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
      
      // 1. 检查成熟 (绝对时间判断，无需概率)
      if (land.status === 'planted' && land.matureAt && land.matureAt <= now) {
        updateData.status = 'harvestable';
        needsUpdate = true;
      }

      // 2. 惰性计算灾害 (仅针对: 生长中 且 未成熟 的作物)
      // 如果已经成熟(harvestable)或枯萎(withered)，停止生成新灾害
      // 注意：上面的逻辑可能刚把 status 改为 harvestable，这里要用最新状态判断
      const currentStatus = updateData.status || land.status;
      
      if (currentStatus === 'planted') {
        // 计算距离上次计算过去了多少分钟
        const lastCalc = land.lastCalculatedAt ? new Date(land.lastCalculatedAt) : (land.plantedAt ? new Date(land.plantedAt) : now);
        
        const diffMs = now.getTime() - lastCalc.getTime();
        const diffMinutes = Math.floor(diffMs / 60000); // 向下取整，不足1分钟不算

        if (diffMinutes > 0) {
          // --- 概率补算逻辑 ---
          
          // A. 杂草
          if (!land.hasWeeds) {
            const prob = 1 - Math.pow(1 - BASE_RATES.WEED, diffMinutes);
            if (Math.random() < prob) {
              updateData.hasWeeds = true;
              needsUpdate = true;
            }
          }
          
          // B. 虫害
          if (!land.hasPests) {
             const prob = 1 - Math.pow(1 - BASE_RATES.PEST, diffMinutes);
             if (Math.random() < prob) {
               updateData.hasPests = true;
               needsUpdate = true;
             }
          }

          // C. 干旱
          if (!land.needsWater) {
             const prob = 1 - Math.pow(1 - BASE_RATES.WATER, diffMinutes);
             if (Math.random() < prob) {
               updateData.needsWater = true;
               needsUpdate = true;
             }
          }
          
          // 无论是否发生灾害，都必须更新计算时间戳
          updateData.lastCalculatedAt = now;
          needsUpdate = true;
        }
      } else {
          // 非种植状态（空地、枯萎、成熟），也更新时间戳保持同步
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

  // 照料 (浇水/除草/杀虫)
  static async care(playerId: string, position: number, type: 'water' | 'weed' | 'pest') {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });

    if (!land) throw new Error('Land not found');

    // [修改点] 只能照料正在生长的作物 (planted)，不能照料已成熟的 (harvestable)
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

    // 更新状态并给予经验
    const [updatedLand, updatedPlayer] = await prisma.$transaction([
      prisma.land.update({
        where: { id: land.id },
        data: updateData
      }),
      prisma.player.update({
        where: { id: playerId },
        data: { exp: { increment: expReward } }
      })
    ]);
    
    // 升级检查
    const newLevel = Math.floor(Math.sqrt(updatedPlayer.exp / 10)) + 1;
    if (newLevel !== updatedPlayer.level) {
      await prisma.player.update({ where: { id: playerId }, data: { level: newLevel } });
      updateLeaderboard('level', playerId, newLevel).catch(console.error);
    }

    return { success: true, exp: expReward, land: updatedLand };
  }

  // 收获 (带惩罚结算)
  static async harvest(playerId: string, position: number) {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });

    if (!land || land.status !== 'harvestable' || !land.cropType) {
      throw new Error('Nothing to harvest');
    }

    const crop = await prisma.crop.findUnique({ where: { type: land.cropType } });
    if (!crop) throw new Error('Crop config missing');

    // =====================================================
    // [修改点] 收益惩罚结算逻辑
    // =====================================================
    
    // 1. 基础产量 (扣除被偷)
    const baseYield = Math.max(1, crop.yield - land.stolenCount);
    
    // 2. 灾害惩罚比例
    let penaltyRate = 0;
    if (land.hasWeeds) penaltyRate += 0.20;   // 杂草 -20%
    if (land.hasPests) penaltyRate += 0.30;   // 虫害 -30%
    if (land.needsWater) penaltyRate += 0.20; // 干旱 -20%
    
    // 封顶扣除 90% (防止扣成负数)
    penaltyRate = Math.min(0.9, penaltyRate);

    // 计算最终金币
    const grossIncome = crop.sellPrice * baseYield;
    const penaltyAmount = Math.floor(grossIncome * penaltyRate);
    const netIncome = Math.max(0, grossIncome - penaltyAmount);
    
    // 经验值通常不扣，作为一种保底奖励
    const rewardExp = crop.exp;

    // =====================================================

    // 更新玩家资产
    const updatedPlayer = await prisma.player.update({
      where: { id: playerId },
      data: {
        gold: { increment: netIncome },
        exp: { increment: rewardExp }
      }
    });
    
    // 升级检查
    updateLeaderboard('gold', playerId, updatedPlayer.gold).catch(console.error);
    const newLevel = Math.floor(Math.sqrt(updatedPlayer.exp / 10)) + 1;
    if (newLevel !== updatedPlayer.level) {
        await prisma.player.update({ where: { id: playerId }, data: { level: newLevel } });
        updateLeaderboard('level', playerId, newLevel).catch(console.error);
    }

    // 处理土地状态 (多季 vs 枯萎)
    let newLandStatus = 'empty';
    let newMatureAt = null;
    let newRemainingHarvests = land.remainingHarvests - 1;
    const now = new Date();
    
    if (newRemainingHarvests > 0) {
        // 进入下一季生长
        newLandStatus = 'planted';
        newMatureAt = new Date(now.getTime() + crop.regrowTime * 1000);
    } else {
        // 彻底枯萎
        newLandStatus = 'withered';
        newRemainingHarvests = 0;
    }

    // 重置土地
    await prisma.land.update({
      where: { id: land.id },
      data: {
        status: newLandStatus,
        matureAt: newMatureAt,
        remainingHarvests: newRemainingHarvests,
        stolenCount: 0,
        // 清除旧的病害状态，为下一轮准备
        hasWeeds: false,
        hasPests: false,
        needsWater: false,
        lastCalculatedAt: now
      }
    });

    return { 
        gold: netIncome, 
        exp: rewardExp, 
        penalty: penaltyAmount, // 返回扣除金额，方便前端展示
        nextSeason: newRemainingHarvests > 0,
        isWithered: newRemainingHarvests === 0
    };
  }

  // 铲除枯萎作物
  static async shovel(playerId: string, position: number) {
    const land = await prisma.land.findUnique({
        where: { playerId_position: { playerId, position } }
    });

    if (!land || land.status !== 'withered') {
        throw new Error('Nothing to shovel');
    }

    const expReward = 15; 
    const now = new Date();

    const [updatedLand, updatedPlayer] = await prisma.$transaction([
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
            where: { id: playerId },
            data: { exp: { increment: expReward } }
        })
    ]);

    return { success: true, exp: expReward, land: updatedLand };
  }
}