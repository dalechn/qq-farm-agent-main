// backend/src/services/FollowService.ts

import prisma from '../utils/prisma';
import {
  redisClient,
  KEYS,
  KEY_PREFIX_FOLLOWING,
  KEY_PREFIX_FOLLOWERS,
} from '../utils/redis';
import { GameService } from './GameService'; // 复用获取玩家信息逻辑

export class FollowService {

  // ==================== 辅助方法：预热 Redis (如果 Redis 为空) ====================
  // 在系统启动或发现数据异常时调用
  static async syncUserSocialToRedis(userId: string) {
    const following = await prisma.follow.findMany({ where: { followerId: userId } });
    const followers = await prisma.follow.findMany({ where: { followingId: userId } });

    const followingKey = `${KEY_PREFIX_FOLLOWING}${userId}`;
    const followersKey = `${KEY_PREFIX_FOLLOWERS}${userId}`;

    const pipeline = redisClient.multi();
    pipeline.del(followingKey);
    pipeline.del(followersKey);

    // 使用 ZADD，Score 可以是 createdAt 的时间戳
    for (const f of following) {
      pipeline.zAdd(followingKey, { score: f.createdAt.getTime(), value: f.followingId });
    }
    for (const f of followers) {
      pipeline.zAdd(followersKey, { score: f.createdAt.getTime(), value: f.followerId });
    }

    // 设置过期时间，防止无限增长占用 (例如 7 天不活跃就过期，重新加载)
    pipeline.expire(followingKey, 86400 * 7);
    pipeline.expire(followersKey, 86400 * 7);

    await pipeline.exec();
  }

  // ==================== 核心业务逻辑 (Redis First) ====================

  /**
   * 关注操作
   * 1. 检查 Redis 是否已关注
   * 2. 原子写入 Redis (ZSET)
   * 3. 发送 Stream 消息 (异步落库 + 通知)
   */
  static async follow(followerId: string, followingId: string) {
    if (followerId === followingId) throw new Error('Cannot follow yourself');

    const followingKey = `${KEY_PREFIX_FOLLOWING}${followerId}`; // 我关注的列表
    const followersKey = `${KEY_PREFIX_FOLLOWERS}${followingId}`; // 对方的粉丝列表

    // 1. 检查是否已关注 (Redis ZSCORE 查询 O(1))
    const score = await redisClient.zScore(followingKey, followingId);
    if (score !== null) throw new Error('Already following');

    const now = Date.now();

    // 2. 检查是否互粉 (查询对方是否关注了我)
    const reverseKey = `${KEY_PREFIX_FOLLOWING}${followingId}`;
    const reverseScore = await redisClient.zScore(reverseKey, followerId);
    const isMutual = reverseScore !== null;

    // 3. Redis 事务写入
    const pipeline = redisClient.multi();
    pipeline.zAdd(followingKey, { score: now, value: followingId });
    pipeline.zAdd(followersKey, { score: now, value: followerId });

    // 4. 发送 Stream 消息 (替代 BullMQ)
    // 包含: 动作, 发起人, 目标, 是否互粉, 时间戳
    pipeline.xAdd(KEYS.MQ_SOCIAL_EVENTS, '*', {
      action: 'FOLLOW',
      followerId,
      followingId,
      isMutual: isMutual ? 'true' : 'false',
      ts: now.toString()
    });

    await pipeline.exec();

    return { success: true, isMutual };
  }

  /**
   * 取消关注
   */
  static async unfollow(followerId: string, followingId: string) {
    const followingKey = `${KEY_PREFIX_FOLLOWING}${followerId}`;
    const followersKey = `${KEY_PREFIX_FOLLOWERS}${followingId}`;

    // 1. 检查是否存在
    const score = await redisClient.zScore(followingKey, followingId);
    if (score === null) throw new Error('Not following');

    const now = Date.now();

    // 2. Redis 事务删除
    const pipeline = redisClient.multi();
    pipeline.zRem(followingKey, followingId);
    pipeline.zRem(followersKey, followerId);

    // 3. 发送 Stream 消息
    pipeline.xAdd(KEYS.MQ_SOCIAL_EVENTS, '*', {
      action: 'UNFOLLOW',
      followerId,
      followingId,
      ts: now.toString()
    });

    await pipeline.exec();

    return { success: true };
  }

  // ==================== 查询逻辑 (Read from Redis) ====================

  /**
   * 获取关注列表 (分页)
   * 从 Redis ZSET 获取 ID -> 批量获取玩家信息
   */
  static async getFollowing(playerId: string, page: number = 1, limit: number = 20): Promise<{
    data: { id: string; name: string; avatar: string; level: number; isMutual: boolean; }[];
    pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean; };
  }> {
    const key = `${KEY_PREFIX_FOLLOWING}${playerId}`;
    const start = (page - 1) * limit;
    const stop = start + limit - 1;

    // 1. 获取总数
    const total = await redisClient.zCard(key);

    // 2. 获取 ID 列表 (按时间倒序: ZREVRANGE)
    // 如果 Redis 不存在该 Key，可能是过期了，尝试从 DB 加载 (Lazy Load)
    if (total === 0) {
      // 简单的 Double-Check: 只有当 DB 确实有数据但 Redis 为空时才加载
      const dbCount = await prisma.follow.count({ where: { followerId: playerId } });
      if (dbCount > 0) {
        await this.syncUserSocialToRedis(playerId);
        return this.getFollowing(playerId, page, limit); // 重试
      }
    }

    const followingIds = await redisClient.zRange(key, start, stop, { REV: true });

    // 3. 批量查询详情 (这里可以复用 GameService.getPlayerState 里的缓存逻辑，或者简单查 DB)
    // 为了极致性能，建议只查 DB 的 Name/Avatar，或者从 Redis Player Hash 查
    const data = await this.enrichUsers(followingIds, playerId);

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasMore: stop < total - 1
      }
    };
  }

  /**
   * 获取粉丝列表
   */
  static async getFollowers(playerId: string, page: number = 1, limit: number = 20): Promise<{
    data: { id: string; name: string; avatar: string; level: number; isMutual: boolean; }[];
    pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean; };
  }> {
    const key = `${KEY_PREFIX_FOLLOWERS}${playerId}`;
    const start = (page - 1) * limit;
    const stop = start + limit - 1;

    const total = await redisClient.zCard(key);

    // Lazy Load check
    if (total === 0) {
      const dbCount = await prisma.follow.count({ where: { followingId: playerId } });
      if (dbCount > 0) {
        await this.syncUserSocialToRedis(playerId);
        return this.getFollowers(playerId, page, limit);
      }
    }

    const followerIds = await redisClient.zRange(key, start, stop, { REV: true });
    const data = await this.enrichUsers(followerIds, playerId);

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasMore: stop < total - 1
      }
    };
  }

  /**
   * 获取好友 (互粉)
   * Redis ZINTER (交集)
   */
  static async getFriends(userId: string, page?: number, limit?: number) {
    const followingKey = `${KEY_PREFIX_FOLLOWING}${userId}`;
    const followersKey = `${KEY_PREFIX_FOLLOWERS}${userId}`;

    // 临时 Key 用于存储交集结果 (带 60s 过期)
    const tempKey = `temp:friends:${userId}`;

    // ZINTERSTORE tempKey 2 key1 key2
    // 计算交集并存入 tempKey
    await redisClient.zInterStore(tempKey, [followingKey, followersKey]);
    await redisClient.expire(tempKey, 60);

    const total = await redisClient.zCard(tempKey);
    let ids: string[] = [];

    let pagination = undefined;
    if (page && limit) {
      const start = (page - 1) * limit;
      const stop = start + limit - 1;
      ids = await redisClient.zRange(tempKey, start, stop, { REV: true });
      pagination = {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasMore: stop < total - 1
      };
    } else {
      ids = await redisClient.zRange(tempKey, 0, -1, { REV: true });
    }

    const friends = await this.enrichUsers(ids, userId, true); // 强制 isMutual = true

    if (pagination) {
      return { data: friends, pagination };
    }
    return friends;
  }

  // 辅助：填充用户信息并检查互粉状态
  private static async enrichUsers(targetIds: string[], currentUserId: string, forceMutual = false) {
    if (targetIds.length === 0) return [];

    // 1. 批量查 DB 获取名字/头像 (因为 Redis Hash 可能过期，DB 最稳)
    // 也可以优化为: 先 pipeline.hgetall 从 Redis 取，没有的再查 DB
    const users = await prisma.player.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, name: true, avatar: true, level: true }
    });

    // 2. 检查互粉状态 (如果是获取粉丝列表，需要检查我是否也关注了他们)
    // 如果 forceMutual=true 则跳过检查
    const myFollowingKey = `${KEY_PREFIX_FOLLOWING}${currentUserId}`;

    // 为了保持顺序，我们根据 targetIds 的顺序重组 users
    const result = await Promise.all(targetIds.map(async (tid) => {
      const user = users.find(u => u.id === tid);
      if (!user) return null;

      let isMutual = forceMutual;
      if (!forceMutual) {
        // 检查 tid 是否在我的关注列表中
        const score = await redisClient.zScore(myFollowingKey, tid);
        isMutual = score !== null;
      }

      return {
        ...user,
        isMutual
      };
    }));

    return result.filter(u => u !== null);
  }
}