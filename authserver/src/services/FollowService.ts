// backend/src/services/FollowService.ts

import prisma from '../utils/prisma';
import {
  redisClient,
  KEYS,
  SOCIAL_KEYS,
  parseRedisHash
} from '../utils/redis';
import { SOCIAL_SCRIPTS } from '../utils/social-scripts'; // [修改] 引用新文件

export class FollowService {

  // ==================== [优化] 辅助方法：预热 Redis ====================
  // 增加 Limit 限制，防止大 V 用户导致 OOM
  static async syncUserSocialToRedis(userId: string) {
    const MAX_CACHE_SIZE = 5000;

    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_CACHE_SIZE
    });

    const followers = await prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_CACHE_SIZE
    });

    const followingKey = `${SOCIAL_KEYS.FOLLOWING}${userId}`;
    const followersKey = `${SOCIAL_KEYS.FOLLOWERS}${userId}`;

    const pipeline = redisClient.multi();
    pipeline.del(followingKey);
    pipeline.del(followersKey);

    for (const f of following) {
      pipeline.zAdd(followingKey, { score: f.createdAt.getTime(), value: f.followingId });
    }
    for (const f of followers) {
      pipeline.zAdd(followersKey, { score: f.createdAt.getTime(), value: f.followerId });
    }

    pipeline.expire(followingKey, 86400 * 7);
    pipeline.expire(followersKey, 86400 * 7);

    await pipeline.exec();
  }

  // ==================== 核心业务逻辑 (Lua Atomic) ====================

  static async follow(followerId: string, followingId: string) {
    if (followerId === followingId) throw new Error('Cannot follow yourself');

    const followingKey = `${SOCIAL_KEYS.FOLLOWING}${followerId}`;
    const followersKey = `${SOCIAL_KEYS.FOLLOWERS}${followingId}`;

    // 预检查互粉状态 (为了传给 Lua)
    const reverseKey = `${SOCIAL_KEYS.FOLLOWING}${followingId}`;
    const reverseScore = await redisClient.zScore(reverseKey, followerId);
    const isMutual = reverseScore !== null;
    const now = Date.now();

    // [修改] 使用新的 SOCIAL_SCRIPTS.FOLLOW
    const res = await redisClient.eval(SOCIAL_SCRIPTS.FOLLOW, {
      keys: [followingKey, followersKey, SOCIAL_KEYS.MQ_EVENTS],
      arguments: [followerId, followingId, now.toString(), isMutual ? 'true' : 'false']
    });

    if (res && typeof res === 'object' && (res as any).err) {
      throw new Error((res as any).err);
    }

    return { success: true, isMutual };
  }

  static async unfollow(followerId: string, followingId: string) {
    const followingKey = `${SOCIAL_KEYS.FOLLOWING}${followerId}`;
    const followersKey = `${SOCIAL_KEYS.FOLLOWERS}${followingId}`;
    const now = Date.now();

    // [修改] 使用新的 SOCIAL_SCRIPTS.UNFOLLOW
    const res = await redisClient.eval(SOCIAL_SCRIPTS.UNFOLLOW, {
      keys: [followingKey, followersKey, SOCIAL_KEYS.MQ_EVENTS],
      arguments: [followerId, followingId, now.toString()]
    });

    if (res && typeof res === 'object' && (res as any).err) {
      throw new Error((res as any).err);
    }

    return { success: true };
  }

  // ==================== 查询逻辑 (Read Optimization) ====================

  static async getFollowing(playerId: string, page: number = 1, limit: number = 20) {
    const key = `${SOCIAL_KEYS.FOLLOWING}${playerId}`;
    return this.getListByZset(key, playerId, page, limit, 'following');
  }

  static async getFollowers(playerId: string, page: number = 1, limit: number = 20) {
    const key = `${SOCIAL_KEYS.FOLLOWERS}${playerId}`;
    return this.getListByZset(key, playerId, page, limit, 'followers');
  }

  private static async getListByZset(key: string, ownerId: string, page: number, limit: number, type: 'following' | 'followers') {
    const start = (page - 1) * limit;
    const stop = start + limit - 1;

    let total = await redisClient.zCard(key);

    if (total === 0) {
      const dbCount = type === 'following'
        ? await prisma.follow.count({ where: { followerId: ownerId } })
        : await prisma.follow.count({ where: { followingId: ownerId } });

      if (dbCount > 0) {
        await this.syncUserSocialToRedis(ownerId);
        total = await redisClient.zCard(key);
      }
    }

    const ids = await redisClient.zRange(key, start, stop, { REV: true });
    const data = await this.enrichUsers(ids, ownerId);

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasMore: stop < total - 1
      }
    };
  }

  static async getFriends(userId: string, page?: number, limit?: number) {
    const followingKey = `${SOCIAL_KEYS.FOLLOWING}${userId}`;
    const followersKey = `${SOCIAL_KEYS.FOLLOWERS}${userId}`;
    const tempKey = `temp:friends:${userId}`;

    await redisClient.zInterStore(tempKey, [followingKey, followersKey]);
    await redisClient.expire(tempKey, 60);

    const total = await redisClient.zCard(tempKey);
    let ids: string[] = [];
    let pagination = undefined;

    if (page && limit) {
      const start = (page - 1) * limit;
      const stop = start + limit - 1;
      ids = await redisClient.zRange(tempKey, start, stop, { REV: true });
      pagination = { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: stop < total - 1 };
    } else {
      ids = await redisClient.zRange(tempKey, 0, -1, { REV: true });
    }

    const friends = await this.enrichUsers(ids, userId, true);

    if (pagination) return { data: friends, pagination };
    return friends;
  }

  // ==================== 用户信息填充 (Redis First) ====================
  private static async enrichUsers(targetIds: string[], currentUserId: string, forceMutual = false) {
    if (targetIds.length === 0) return [];

    const enrichedData: any[] = new Array(targetIds.length).fill(null);
    const missingIndices: number[] = [];
    const missingIds: string[] = [];

    // 1. Redis Cache 批量读取
    const pipeline = redisClient.multi();
    targetIds.forEach(id => pipeline.hGetAll(KEYS.PLAYER(id)));
    const redisResults = await pipeline.exec();

    redisResults?.forEach((res: any, index) => {
      if (res && res.name) {
        const player = parseRedisHash<any>(res);
        enrichedData[index] = {
          id: targetIds[index],
          name: player.name,
          avatar: player.avatar,
          level: Number(player.level || 1)
        };
      } else {
        missingIndices.push(index);
        missingIds.push(targetIds[index]);
      }
    });

    // 2. 数据库回源 (只查 Redis 缺失的)
    if (missingIds.length > 0) {
      const dbUsers = await prisma.player.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, name: true, avatar: true, level: true }
      });

      dbUsers.forEach(user => {
        for (const originalIndex of missingIndices) {
          if (targetIds[originalIndex] === user.id) {
            enrichedData[originalIndex] = user;
            break;
          }
        }
      });
    }

    // 3. 互粉状态检查
    const myFollowingKey = `${SOCIAL_KEYS.FOLLOWING}${currentUserId}`;
    const result = await Promise.all(enrichedData.map(async (user, index) => {
      if (!user) return null;

      let isMutual = forceMutual;
      if (!forceMutual) {
        const tid = targetIds[index];
        const score = await redisClient.zScore(myFollowingKey, tid);
        isMutual = score !== null;
      }

      return { ...user, isMutual };
    }));

    return result.filter(u => u !== null);
  }
}