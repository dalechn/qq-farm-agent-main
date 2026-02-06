// backend/src/services/FollowService.ts

import prisma from '../utils/prisma';
import {
  redisClient,
  acquireLock,
  releaseLock,
  updateLeaderboard,
  QUEUE_STEAL_EVENTS,
  QUEUE_SOCIAL_EVENTS,
  invalidatePlayerCache,
  getLandLockKey,
  KEY_PREFIX_FOLLOWING,
  KEY_PREFIX_FOLLOWERS,
  checkAndMarkStealToday
} from '../utils/redis';
import { GAME_CONFIG, CROPS } from '../config/game-keys';

const DOG_CONFIG = GAME_CONFIG.DOG;

export class FollowService {

  // ==================== 辅助方法：同步/预热 Redis ====================
  static async syncUserSocialToRedis(userId: string) {
    const following = await prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
    const followers = await prisma.follow.findMany({ where: { followingId: userId }, select: { followerId: true } });

    const followingKey = `${KEY_PREFIX_FOLLOWING}${userId}`;
    const followersKey = `${KEY_PREFIX_FOLLOWERS}${userId}`;

    const pipeline = redisClient.multi();
    
    pipeline.del(followingKey);
    pipeline.del(followersKey);

    if (following.length > 0) {
      pipeline.sAdd(followingKey, following.map(f => f.followingId));
    }
    if (followers.length > 0) {
      pipeline.sAdd(followersKey, followers.map(f => f.followerId));
    }
    
    await pipeline.exec();
  }

  // ==================== 核心业务逻辑 ====================

  // 关注某人
  static async follow(followerId: string, followingId: string) {
    if (followerId === followingId) throw new Error('Cannot follow yourself');

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } }
    });
    if (existing) throw new Error('Already following');

    await prisma.follow.create({
      data: { followerId, followingId }
    });

    const followingKey = `${KEY_PREFIX_FOLLOWING}${followerId}`;
    const followersKey = `${KEY_PREFIX_FOLLOWERS}${followingId}`;
    
    const pipeline = redisClient.multi();
    pipeline.sAdd(followingKey, followingId); 
    pipeline.sAdd(followersKey, followerId);  
    await pipeline.exec();

    const isMutual = await this.checkMutualFollow(followerId, followingId);

    const eventData = {
        type: 'FOLLOW_EVENT',
        followerId,
        followingId,
        isMutual,
        timestamp: new Date().toISOString()
    };
    await redisClient.lPush(QUEUE_SOCIAL_EVENTS, JSON.stringify(eventData));

    return { success: true, isMutual };
  }

  // 取消关注
  static async unfollow(followerId: string, followingId: string) {
    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } }
    });

    if (!existing) throw new Error('Not following');

    await prisma.follow.delete({
      where: { id: existing.id }
    });

    const followingKey = `${KEY_PREFIX_FOLLOWING}${followerId}`;
    const followersKey = `${KEY_PREFIX_FOLLOWERS}${followingId}`;

    const pipeline = redisClient.multi();
    pipeline.sRem(followingKey, followingId);
    pipeline.sRem(followersKey, followerId);
    await pipeline.exec();

    return { success: true };
  }

  /**
   * [Redis 优化版] 检查是否互相关注
   * 修复 TS 错误：显式转换 number (0/1) 为 boolean
   */
  static async checkMutualFollow(userA: string, userB: string): Promise<boolean> {
    const keyA = `${KEY_PREFIX_FOLLOWING}${userA}`; 
    const keyB = `${KEY_PREFIX_FOLLOWING}${userB}`; 

    // Redis 返回的是 number (0 或 1)
    const [aFollowsBRaw, bFollowsARaw] = await Promise.all([
      redisClient.sIsMember(keyA, userB),
      redisClient.sIsMember(keyB, userA)
    ]);

    // [修复点] 强制转换为 boolean
    const aFollowsB = Boolean(aFollowsBRaw);
    const bFollowsA = Boolean(bFollowsARaw);

    // 兜底逻辑：如果两个都是 false，可能缓存未命中，可选择查 DB（此处略过，保持高性能）
    return aFollowsB && bFollowsA;
  }

  // 原始 DB 检查 (仅作兜底)
  private static async checkMutualFollowFromDB(userA: string, userB: string): Promise<boolean> {
    const count = await prisma.follow.count({
      where: {
        OR: [
          { followerId: userA, followingId: userB },
          { followerId: userB, followingId: userA }
        ]
      }
    });
    return count === 2;
  }

  // [Redis 优化版] 获取关注列表
  static async getFollowing(playerId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [follows, total] = await prisma.$transaction([
      prisma.follow.findMany({
        where: { followerId: playerId },
        include: { following: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.follow.count({ where: { followerId: playerId } })
    ]);

    const myFollowersKey = `${KEY_PREFIX_FOLLOWERS}${playerId}`;
    
    // [修复点] 这里的 map 返回 Promise<number>[]，需要转换
    const checkPromises = follows.map(f => redisClient.sIsMember(myFollowersKey, f.followingId));
    const rawResults = await Promise.all(checkPromises);
    const isMutualResults = rawResults.map(r => Boolean(r)); // 转为 boolean

    const data = follows.map((f: any, index: number) => ({
      ...f.following,
      isMutual: isMutualResults[index]
    }));

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + follows.length < total
      }
    };
  }

  // [Redis 优化版] 获取粉丝列表
  static async getFollowers(playerId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [follows, total] = await prisma.$transaction([
      prisma.follow.findMany({
        where: { followingId: playerId },
        include: { follower: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.follow.count({ where: { followingId: playerId } })
    ]);

    const myFollowingKey = `${KEY_PREFIX_FOLLOWING}${playerId}`;
    
    // [修复点] 转为 boolean
    const checkPromises = follows.map(f => redisClient.sIsMember(myFollowingKey, f.followerId));
    const rawResults = await Promise.all(checkPromises);
    const isMutualResults = rawResults.map(r => Boolean(r));

    const data = follows.map((f: any, index: number) => ({
      ...f.follower,
      isMutual: isMutualResults[index]
    }));

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + follows.length < total
      }
    };
  }

  // [Redis 终极优化] 获取好友 (互粉列表)
  static async getFriends(userId: string, page?: number, limit?: number) {
    const followingKey = `${KEY_PREFIX_FOLLOWING}${userId}`;
    const followersKey = `${KEY_PREFIX_FOLLOWERS}${userId}`;

    // SINTER 返回 string[]，无需转换类型
    const friendIds = await redisClient.sInter([followingKey, followersKey]);

    if (friendIds.length === 0) {
        return isPagination(page, limit) ? { data: [], pagination: { total: 0 } } : [];
    }

    let targetIds = friendIds;
    let total = friendIds.length;
    let paginationData = null;

    if (page !== undefined && limit !== undefined) {
       const start = (page - 1) * limit;
       const end = start + limit;
       targetIds = friendIds.slice(start, end);

       paginationData = {
           page, limit, total,
           totalPages: Math.ceil(total / limit),
           hasMore: end < total
       };
    }

    const friends = await prisma.player.findMany({
        where: { id: { in: targetIds } },
        orderBy: { createdAt: 'desc' }
    });

    const resultData = friends.map(f => ({ ...f, isMutual: true }));

    if (paginationData) {
        return { data: resultData, pagination: paginationData };
    }
    return resultData;
  }

  // 获取好友农场
  static async getFriendFarm(playerId: string, friendId: string) {
    const isMutual = await this.checkMutualFollow(playerId, friendId);
    if (!isMutual) {
      throw new Error('Not mutual followers (not friends)');
    }

    const friend = await prisma.player.findUnique({
      where: { id: friendId },
      include: {
        lands: { orderBy: { position: 'asc' } }
      }
    });

    return friend;
  }

  // ==================== 偷菜逻辑 ====================
  
  static async stealCrop(stealerId: string, victimId: string, position: number) {
    if (stealerId === victimId) throw new Error('Cannot steal from yourself');

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

      const isMutual = await this.checkMutualFollow(stealerId, victimId);
      if (!isMutual) throw new Error('Not mutual followers');

      const victim = await prisma.player.findUnique({
        where: { id: victimId },
        select: { name: true, hasDog: true, dogActiveUntil: true, gold: true }
      });

      const now = new Date();
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

        const eventData = {
            type: 'DOG_BITTEN',
            stealerId,
            stealerName: stealer?.name,
            victimId,
            victimName: victim?.name,
            position,
            penalty,
            timestamp: now.toISOString()
        };
        await redisClient.lPush(QUEUE_STEAL_EVENTS, JSON.stringify(eventData));

        await invalidatePlayerCache(stealerId);
        await invalidatePlayerCache(victimId);

        return {
          success: false,
          code: 'DOG_BITTEN',
          message: `被 ${victim?.name} 的狗咬了！损失 ${penalty} 金币`,
          penalty
        };
      }
      
      if (land.stolenCount >= 3) throw new Error('This crop has been stolen too many times');

      // 每日防刷检查 (Redis)
      const alreadyStolen = await checkAndMarkStealToday(stealerId, victimId, position);
      if (alreadyStolen) throw new Error('Already stolen today');

      const crop = CROPS.find(c => c.type === land.cropType); 
      if (!crop) throw new Error('Crop config not found');

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
      const eventData = {
          type: 'STEAL_SUCCESS',
          stealerId,
          stealerName,
          victimId,
          victimName: victim?.name,
          position,
          cropName: crop.name,
          cropType: land.cropType,
          amount: stealAmount,
          goldValue,
          timestamp: now.toISOString()
      };
      await redisClient.lPush(QUEUE_STEAL_EVENTS, JSON.stringify(eventData));

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

function isPagination(page?: number, limit?: number): boolean {
    return page !== undefined && limit !== undefined;
}