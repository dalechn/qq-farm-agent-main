import prisma from '../utils/prisma';

export class GameService {
  static async getPlayerState(playerId: string) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { lands: { orderBy: { position: 'asc' } } }
    });
    
    if (!player) return null;

    // 检查并更新土地状态（是否成熟）
    const now = new Date();
    const updatedLands = await Promise.all(player.lands.map(async (land) => {
      if (land.status === 'planted' && land.matureAt && land.matureAt <= now) {
        return await prisma.land.update({
          where: { id: land.id },
          data: { status: 'harvestable' }
        });
      }
      return land;
    }));

    return { ...player, lands: updatedLands };
  }

  static async plant(playerId: string, position: number, cropType: string) {
    const crop = await prisma.crop.findUnique({ where: { type: cropType } });
    if (!crop) throw new Error('Crop not found');

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player || player.gold < crop.seedPrice) throw new Error('Insufficient gold');

    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });
    if (!land || land.status !== 'empty') throw new Error('Land not available');

    const matureAt = new Date(Date.now() + crop.matureTime * 1000);

    return await prisma.$transaction([
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
          matureAt
        }
      })
    ]);
  }

  static async harvest(playerId: string, position: number) {
    const land = await prisma.land.findUnique({
      where: { playerId_position: { playerId, position } }
    });

    if (!land || land.status !== 'harvestable' || !land.cropType) {
      throw new Error('Nothing to harvest');
    }

    const crop = await prisma.crop.findUnique({ where: { type: land.cropType } });
    if (!crop) throw new Error('Crop config missing');

    // 计算实际收获（减去被偷的数量）
    const actualYield = Math.max(1, crop.yield - land.stolenCount);
    const rewardGold = crop.sellPrice * actualYield;
    const rewardExp = crop.exp;

    const updatedPlayer = await prisma.player.update({
      where: { id: playerId },
      data: {
        gold: { increment: rewardGold },
        exp: { increment: rewardExp }
      }
    });

    // 计算等级
    const newLevel = Math.floor(Math.sqrt(updatedPlayer.exp / 10)) + 1;
    if (newLevel !== updatedPlayer.level) {
      await prisma.player.update({
        where: { id: playerId },
        data: { level: newLevel }
      });
    }

    await prisma.land.update({
      where: { id: land.id },
      data: {
        status: 'empty',
        cropType: null,
        plantedAt: null,
        matureAt: null,
        stolenCount: 0  // 重置被偷次数
      }
    });

    return { gold: rewardGold, exp: rewardExp };
  }
}
