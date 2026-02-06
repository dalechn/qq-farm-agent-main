// backend/src/services/FollowService.ts

import prisma from '../utils/prisma';
import {
  redisClient,
  QUEUE_SOCIAL_EVENTS,
  KEY_PREFIX_FOLLOWING,
  KEY_PREFIX_FOLLOWERS,
} from '../utils/redis';


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
}

function isPagination(page?: number, limit?: number): boolean {
    return page !== undefined && limit !== undefined;
}