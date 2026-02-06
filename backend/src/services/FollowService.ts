// backend/src/services/FollowService.ts

import prisma from '../utils/prisma';
import { sendToPlayer } from '../utils/websocket';
import { redisClient, acquireLock, releaseLock, updateLeaderboard } from '../utils/redis';
import { GAME_CONFIG } from '../config/game-keys';
import { QUEUE_STEAL_EVENTS, QUEUE_SOCIAL_EVENTS } from '../config/redis-keys';
const DOG_CONFIG = GAME_CONFIG.DOG;

export class FollowService {
  // 关注某人
  static async follow(followerId: string, followingId: string) {
    if (followerId === followingId) throw new Error('Cannot follow yourself');

    // 1. 检查是否已经关注 (读操作，很快)
    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } }
    });
    if (existing) throw new Error('Already following');

    // 2. [核心同步逻辑] 创建关注关系 (必须同步，保证数据一致性)
    await prisma.follow.create({
      data: { followerId, followingId }
    });

    // 3. [核心同步逻辑] 检查互相关注 (为了立刻返回给前端显示 "Mutual" 图标)
    const isMutual = await this.checkMutualFollow(followerId, followingId);

    // 4. [异步任务] 推送事件到队列
    // 我们不需要在这里查名字，把 ID 传给 Worker，让 Worker 去查，节省 API 时间
    const eventData = {
        type: 'FOLLOW_EVENT',
        followerId,
        followingId,
        isMutual,
        timestamp: new Date().toISOString()
    };
    
    await redisClient.lPush(QUEUE_SOCIAL_EVENTS, JSON.stringify(eventData));

    // 5. 立刻返回结果
    return { success: true, isMutual };
  }

  // 取消关注
  static async unfollow(followerId: string, followingId: string) {
    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId }
      }
    });

    if (!existing) {
      throw new Error('Not following');
    }

    await prisma.follow.delete({
      where: { id: existing.id }
    });

    return { success: true };
  }

  // 检查是否互相关注
  static async checkMutualFollow(userA: string, userB: string): Promise<boolean> {
    // 查找 A->B 和 B->A 的记录总数
    const count = await prisma.follow.count({
      where: {
        OR: [
          { followerId: userA, followingId: userB },
          { followerId: userB, followingId: userA }
        ]
      }
    });
    // 只有两条记录都存在，才算互粉
    return count === 2;
  }

  // [核心修改] 获取关注列表 (带 isMutual 状态)
  static async getFollowing(playerId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // 1. 获取我关注的人列表
    const [follows, total] = await prisma.$transaction([
      prisma.follow.findMany({
        where: { followerId: playerId },
        include: { following: true }, // 包含对方信息
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.follow.count({ where: { followerId: playerId } })
    ]);

    // 2. 提取 ID 列表
    const followingIds = follows.map(f => f.followingId);
    let mutualSet = new Set<string>();

    // 3. 批量检查这些人是否也关注了我 (反向查询)
    if (followingIds.length > 0) {
      const reverseFollows = await prisma.follow.findMany({
        where: {
          followerId: { in: followingIds },
          followingId: playerId
        },
        select: { followerId: true }
      });
      mutualSet = new Set(reverseFollows.map(f => f.followerId));
    }

    // 4. 组合数据
    const data = follows.map((f: any) => ({
      ...f.following,
      isMutual: mutualSet.has(f.followingId)
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + follows.length < total
      }
    };
  }

  // [核心修改] 获取粉丝列表 (带 isMutual 状态)
  static async getFollowers(playerId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // 1. 获取关注我的人列表
    const [follows, total] = await prisma.$transaction([
      prisma.follow.findMany({
        where: { followingId: playerId },
        include: { follower: true }, // 包含对方信息
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.follow.count({ where: { followingId: playerId } })
    ]);

    // 2. 提取 ID 列表
    const followerIds = follows.map(f => f.followerId);
    let mutualSet = new Set<string>();

    // 3. 批量检查我是否也关注了这些粉丝
    if (followerIds.length > 0) {
      const myFollows = await prisma.follow.findMany({
        where: {
          followerId: playerId,
          followingId: { in: followerIds }
        },
        select: { followingId: true }
      });
      mutualSet = new Set(myFollows.map(f => f.followingId));
    }

    // 4. 组合数据
    const data = follows.map((f: any) => ({
      ...f.follower,
      isMutual: mutualSet.has(f.followerId)
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + follows.length < total
      }
    };
  }

  static async getFriends(userId: string, page?: number, limit?: number) {
    // 1. 统一的高效查询条件：利用 Prisma 关系筛选互相关注
    // 逻辑：找出 "我关注的人(following)" 中，且 "那个人的关注列表(following.following)" 里包含 "我(userId)" 的记录
    const whereClause = {
      followerId: userId,
      following: {
        following: {
          some: {
            followingId: userId
          }
        }
      }
    };

    // 2. 判断模式：分页模式 vs 全量模式
    const isPaginationMode = page !== undefined && limit !== undefined;

    if (isPaginationMode) {
      // === 分页模式 ===
      const p = page || 1;
      const l = limit || 20;
      const skip = (p - 1) * l;

      const [follows, total] = await prisma.$transaction([
        prisma.follow.findMany({
          where: whereClause,
          include: { following: true }, // 获取对方完整信息
          skip,
          take: l,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.follow.count({ where: whereClause })
      ]);

      return {
        data: follows.map((f: any) => ({ ...f.following, isMutual: true })),
        pagination: {
          page: p,
          limit: l,
          total,
          totalPages: Math.ceil(total / l),
          hasMore: skip + follows.length < total
        }
      };

    } else {
      // === 全量模式 (带安全限制) ===
      // 通常用于内部逻辑判断或无需分页的前端展示
      const safeLimit = 1000; // 防止内存溢出的安全上限
      
      const friends = await prisma.follow.findMany({
        where: whereClause,
        include: { following: true },
        take: safeLimit, 
        orderBy: { createdAt: 'desc' }
      });

      // 直接返回数组
      return friends.map((f: any) => ({ ...f.following, isMutual: true }));
    }
  }

  // 获取好友的农场状态（用于偷菜）- 只有互相关注才能访问
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

  // 偷菜 - 增加看守狗逻辑
  static async stealCrop(stealerId: string, victimId: string, position: number) {
    if (stealerId === victimId) {
      throw new Error('Cannot steal from yourself');
    }

    // [Step 0] 预检查 & 获取 LandID 以便加锁
    // 为了保证锁 Key 与 harvest/plant 一致，我们需要 land.id
    const targetLand = await prisma.land.findUnique({
      where: { playerId_position: { playerId: victimId, position } }
    });
    
    if (!targetLand) throw new Error('Land not found');

    // [Step 1] 统一锁 Key (与 harvest 保持一致)
    const lockKey = `lock:land:${targetLand.id}`;

    // 尝试获取锁
    const hasLock = await acquireLock(lockKey, 3);
    if (!hasLock) {
      throw new Error('Too busy! Someone is interacting with this land.');
    }

    try {
      // 再次检查 (双重检查锁模式)，防止在等待锁时状态变了
      const land = await prisma.land.findUnique({
        where: { id: targetLand.id }
      });
      if (!land || land.status !== 'harvestable') {
        throw new Error('Too late! Nothing to steal.');
      }

      // 验证好友关系 (假设有此方法)
      const isMutual = await this.checkMutualFollow(stealerId, victimId);
      if (!isMutual) throw new Error('Not mutual followers');

      // [看守狗判定]
      // 优化：尝试先从 Redis 缓存读 Victim 状态，减少 DB 压力
      // 这里为了安全演示，还是查 DB，但只查必要字段
      const victim = await prisma.player.findUnique({
        where: { id: victimId },
        select: { name: true, hasDog: true, dogActiveUntil: true, gold: true }
      });

      const now = new Date();
      const isDogActive = victim?.hasDog && victim.dogActiveUntil && victim.dogActiveUntil > now;

      // --- 🐕 触发咬人逻辑 ---
      if (isDogActive && Math.random() < DOG_CONFIG.BITE_RATE) {
        const stealer = await prisma.player.findUnique({ where: { id: stealerId } });
        const penalty = Math.min(stealer?.gold || 0, DOG_CONFIG.PENALTY_GOLD);

        if (penalty > 0) {
          // 原子化金币转移
          await prisma.$transaction([
            prisma.player.update({ where: { id: stealerId }, data: { gold: { decrement: penalty } } }),
            prisma.player.update({ where: { id: victimId }, data: { gold: { increment: penalty } } })
          ]);
        }

        // 推送事件
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

        // [关键] 清除双方缓存，让前端能刷新最新金币
        await this.invalidateCache(stealerId);
        await this.invalidateCache(victimId);

        return {
          success: false,
          code: 'DOG_BITTEN',
          message: `被 ${victim?.name} 的狗咬了！损失 ${penalty} 金币`,
          penalty
        };
      }
      
      // --- 🥬 正常偷菜逻辑 ---
      
      if (land.stolenCount >= 3) {
        throw new Error('This crop has been stolen too many times');
      }

      // 检查今日偷取记录 (建议高并发下改为 Redis SET NX 检查，这里暂时保留 DB)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const existingSteal = await prisma.stealRecord.findFirst({
        where: {
          stealerId,
          victimId,
          landPos: position,
          createdAt: { gte: today }
        }
      });
      if (existingSteal) throw new Error('Already stolen today');

      // 优化：直接从内存配置读取 Crop，不查 DB
      const crop = CROPS.find(c => c.type === land.cropType); 
      // 或者使用 import { CROPS } from '../config/game-keys';
      if (!crop) throw new Error('Crop config not found');

      const stealAmount = 1;
      const goldValue = crop.sellPrice * stealAmount;

      // 事务更新：土地被偷次数 + 小偷金币
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

      // 异步记录
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

      // [关键] 清除缓存
      await this.invalidateCache(stealerId); // 小偷金币变了
      await this.invalidateCache(victimId);  // 被害人土地状态变了

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
      // 释放锁
      await releaseLock(lockKey);
    }
  }

  // 获取偷菜记录
  static async getStealHistory(playerId: string, type: 'stolen' | 'stealer' = 'stealer') {
    if (type === 'stealer') {
      return await prisma.stealRecord.findMany({
        where: { stealerId: playerId },
        include: { victim: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
    } else {
      return await prisma.stealRecord.findMany({
        where: { victimId: playerId },
        include: { stealer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
    }
  }
}