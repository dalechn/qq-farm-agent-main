// backend/src/services/GameService.ts

import prisma from '../utils/prisma';
import { updateLeaderboard } from '../utils/redis';

export class GameService {
  
  // 获取玩家状态（包含随机生成灾害逻辑）
  static async getPlayerState(playerId: string) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { lands: { orderBy: { position: 'asc' } } }
    });
    
    if (!player) return null;

    const now = new Date();
    
    // 检查并更新土地状态
    const updatedLands = await Promise.all(player.lands.map(async (land) => {
      let needsUpdate = false;
      let updateData: any = {};

      // 1. 检查成熟
      if (land.status === 'planted' && land.matureAt && land.matureAt <= now) {
        updateData.status = 'harvestable';
        needsUpdate = true;
      }

      // 2. [新增] 随机触发自然灾害 (仅针对生长中的作物)
      // 这里的概率设为每次刷新 5% 几率，实际生产中可能需要根据上次更新时间计算
      if (land.status === 'planted' && !land.hasWeeds && !land.hasPests && !land.needsWater) {
        const rand = Math.random();
        if (rand < 0.05) { updateData.hasWeeds = true; needsUpdate = true; }
        else if (rand < 0.10) { updateData.hasPests = true; needsUpdate = true; }
        else if (rand < 0.15) { updateData.needsWater = true; needsUpdate = true; }
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
    // 只有 empty 状态才能种
    if (!land || land.status !== 'empty') throw new Error('Land not available');

    const matureAt = new Date(Date.now() + crop.matureTime * 1000);

    // 数据库事务
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
          plantedAt: new Date(),
          matureAt,
          // [新增] 初始化状态
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

  // [新增] 照料作物 (除草/杀虫/浇水)
  static async care(playerId: string, position: number, type: 'water' | 'weed' | 'pest') {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });

    if (!land || (land.status !== 'planted' && land.status !== 'harvestable')) {
      throw new Error('No crop to care for');
    }

    let updateData: any = {};
    const expReward = 10; // 每次照料奖励 10 EXP

    // 检查对应状态
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

    // 更新土地状态并增加经验
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

    // 检查升级
    const newLevel = Math.floor(Math.sqrt(updatedPlayer.exp / 10)) + 1;
    if (newLevel !== updatedPlayer.level) {
      await prisma.player.update({ where: { id: playerId }, data: { level: newLevel } });
      updateLeaderboard('level', playerId, newLevel).catch(console.error);
    }

    return { success: true, exp: expReward, land: updatedLand };
  }

  // 收获 (修改逻辑支持多季和枯萎)
  static async harvest(playerId: string, position: number) {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });

    if (!land || land.status !== 'harvestable' || !land.cropType) {
      throw new Error('Nothing to harvest');
    }

    const crop = await prisma.crop.findUnique({ where: { type: land.cropType } });
    if (!crop) throw new Error('Crop config missing');

    const actualYield = Math.max(1, crop.yield - land.stolenCount);
    const rewardGold = crop.sellPrice * actualYield;
    const rewardExp = crop.exp;

    // 1. 更新玩家
    const updatedPlayer = await prisma.player.update({
      where: { id: playerId },
      data: {
        gold: { increment: rewardGold },
        exp: { increment: rewardExp }
      }
    });

    // 2. 检查升级
    const newLevel = Math.floor(Math.sqrt(updatedPlayer.exp / 10)) + 1;
    if (newLevel !== updatedPlayer.level) {
        await prisma.player.update({ where: { id: playerId }, data: { level: newLevel } });
        updateLeaderboard('level', playerId, newLevel).catch(console.error);
    }
    updateLeaderboard('gold', playerId, updatedPlayer.gold).catch(console.error);

    // 3. 处理土地状态 (多季 vs 枯萎)
    let newLandStatus = 'empty';
    let newMatureAt = null;
    let newRemainingHarvests = land.remainingHarvests - 1;
    let newPlantedAt = land.plantedAt;

    if (newRemainingHarvests > 0) {
        // [情况A] 还有下一季 -> 进入生长期
        newLandStatus = 'planted';
        newMatureAt = new Date(Date.now() + crop.regrowTime * 1000);
    } else {
        // [情况B] 最后一季收完 -> 枯萎 (需要铲子)
        newLandStatus = 'withered'; // 这里的 withered 是 status 字段的值
        newRemainingHarvests = 0;
    }

    // 更新土地
    await prisma.land.update({
      where: { id: land.id },
      data: {
        status: newLandStatus,
        matureAt: newMatureAt,
        remainingHarvests: newRemainingHarvests,
        stolenCount: 0,
        // 如果枯萎了，保留 cropType 以便显示枯萎的什么作物，或者也可以不保留
        // 这里保留直到铲除
      }
    });

    return { 
        gold: rewardGold, 
        exp: rewardExp, 
        nextSeason: newRemainingHarvests > 0,
        isWithered: newRemainingHarvests === 0
    };
  }

  // [新增] 铲除枯萎作物
  static async shovel(playerId: string, position: number) {
    const land = await prisma.land.findUnique({
        where: { playerId_position: { playerId, position } }
    });

    // 只有枯萎的作物才能铲除
    if (!land || land.status !== 'withered') {
        throw new Error('Nothing to shovel');
    }

    const expReward = 15; // 铲除奖励 15 EXP

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
                stolenCount: 0
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