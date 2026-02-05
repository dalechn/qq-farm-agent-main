// backend/src/services/FollowService.ts

import prisma from '../utils/prisma';
import { sendToPlayer, notifySteal } from '../utils/websocket';
import { acquireLock, releaseLock, updateLeaderboard } from '../utils/redis';
import { GAME_CONFIG } from '../config/game-keys'; // [新增] 引入配置

const DOG_CONFIG = GAME_CONFIG.DOG; // [新增]

export class FollowService {
  // 关注某人
  static async follow(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new Error('Cannot follow yourself');
    }

    // 检查是否已经关注
    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId }
      }
    });

    if (existing) {
      throw new Error('Already following');
    }

    // 创建关注关系
    await prisma.follow.create({
      data: { followerId, followingId }
    });

    // 获取关注者信息
    const follower = await prisma.player.findUnique({
      where: { id: followerId },
      select: { name: true }
    });

    // 发送通知给被关注者
    await prisma.notification.create({
      data: {
        playerId: followingId,
        type: 'new_follower',
        message: `${follower?.name} 关注了你！`,
        data: JSON.stringify({ followerId, followerName: follower?.name })
      }
    });

    sendToPlayer(followingId, {
      type: 'new_follower',
      followerId,
      followerName: follower?.name
    });

    // 检查是否互相关注（成为好友）
    const isMutual = await this.checkMutualFollow(followerId, followingId);
    if (isMutual) {
      // 通知双方成为好友
      const following = await prisma.player.findUnique({
        where: { id: followingId },
        select: { name: true }
      });

      await prisma.notification.create({
        data: {
          playerId: followerId,
          type: 'mutual_follow',
          message: `你和 ${following?.name} 互相关注，现在是好友了！`,
          data: JSON.stringify({ friendId: followingId, friendName: following?.name })
        }
      });

      await prisma.notification.create({
        data: {
          playerId: followingId,
          type: 'mutual_follow',
          message: `你和 ${follower?.name} 互相关注，现在是好友了！`,
          data: JSON.stringify({ friendId: followerId, friendName: follower?.name })
        }
      });

      sendToPlayer(followerId, {
        type: 'mutual_follow',
        friendId: followingId,
        friendName: following?.name
      });

      sendToPlayer(followingId, {
        type: 'mutual_follow',
        friendId: followerId,
        friendName: follower?.name
      });
    }

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
    const [aFollowsB, bFollowsA] = await Promise.all([
      prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: userA, followingId: userB } }
      }),
      prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: userB, followingId: userA } }
      })
    ]);

    return !!(aFollowsB && bFollowsA);
  }

  // 获取我关注的人
  static async getFollowing(playerId: string) {
    const follows = await prisma.follow.findMany({
      where: { followerId: playerId },
      include: {
        following: {
          select: { id: true, name: true, level: true, gold: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return follows.map((f) => f.following);
  }

  // 获取关注我的人
  static async getFollowers(playerId: string) {
    const follows = await prisma.follow.findMany({
      where: { followingId: playerId },
      include: {
        follower: {
          select: { id: true, name: true, level: true, gold: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return follows.map((f) => f.follower);
  }

  // 获取好友列表（互相关注的人）
  static async getFriends(playerId: string) {
    // 获取我关注的人
    const following = await prisma.follow.findMany({
      where: { followerId: playerId },
      select: { followingId: true }
    });

    const followingIds = following.map((f) => f.followingId);

    // 找出其中也关注我的人
    const mutualFollows = await prisma.follow.findMany({
      where: {
        followerId: { in: followingIds },
        followingId: playerId
      },
      include: {
        follower: {
          select: { id: true, name: true, level: true, gold: true }
        }
      }
    });

    return mutualFollows.map((f) => f.follower);
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

  // [修改] 偷菜 - 增加看守狗逻辑
  static async stealCrop(stealerId: string, victimId: string, position: number) {
    if (stealerId === victimId) {
      throw new Error('Cannot steal from yourself');
    }

    // 1. 定义锁的 Key
    const lockKey = `lock:steal:${victimId}:${position}`;

    // 2. 尝试获取锁 (3秒过期)
    const hasLock = await acquireLock(lockKey, 3);
    if (!hasLock) {
      throw new Error('Too busy! Someone is already interacting with this land.');
    }

    try {
      // 验证是否是好友（互相关注）
      const isMutual = await this.checkMutualFollow(stealerId, victimId);
      if (!isMutual) {
        throw new Error('Not mutual followers (not friends)');
      }

      // [新增逻辑] 检查看守狗 =========================================
      const victim = await prisma.player.findUnique({ 
          where: { id: victimId },
          select: { name: true, hasDog: true, dogActiveUntil: true, gold: true }
      });
      
      const now = new Date();
      // 只有买过狗且狗粮没过期的才有效
      const isDogActive = victim?.hasDog && victim.dogActiveUntil && victim.dogActiveUntil > now;

      // 如果狗是醒着的，进行概率判定
      if (isDogActive && Math.random() < DOG_CONFIG.BITE_RATE) {
          // --- 触发咬人逻辑 ---
          const stealer = await prisma.player.findUnique({ where: { id: stealerId } });
          
          // 扣除偷菜者金币 (如果钱不够，就扣光)
          const penalty = Math.min(stealer?.gold || 0, DOG_CONFIG.PENALTY_GOLD);
          
          if (penalty > 0) {
              // 偷窃者扣钱
              await prisma.player.update({
                  where: { id: stealerId },
                  data: { gold: { decrement: penalty } }
              });
              // 被偷者获得补偿 (狗捡回来的)
              await prisma.player.update({
                  where: { id: victimId },
                  data: { gold: { increment: penalty } }
              });
          }

          // 发送通知
          const stealerName = stealer?.name || '有人';
          await notifySteal(victimId, stealerName, 'nothing', 0, position); 
          
          // 返回失败状态
          return {
              success: false,
              code: 'DOG_BITTEN',
              message: `哎呀！被 ${victim?.name} 的恶犬咬了一口，掉落了 ${penalty} 金币！`,
              penalty
          };
      }
      // [新增逻辑结束] ===============================================

      // 获取土地信息
      const land = await prisma.land.findUnique({
        where: { playerId_position: { playerId: victimId, position } }
      });

      if (!land || land.status !== 'harvestable') {
        throw new Error('Nothing to steal');
      }

      // 检查是否已经偷过太多次
      if (land.stolenCount >= 3) {
        throw new Error('This crop has been stolen too many times');
      }

      // 检查今天是否已经偷过这块地
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

      if (existingSteal) {
        throw new Error('Already stolen from this land today');
      }

      // 获取作物信息
      const crop = await prisma.crop.findUnique({ where: { type: land.cropType! } });
      if (!crop) throw new Error('Crop not found');

      // 计算偷取数量（偷取 1 个）
      const stealAmount = 1;
      const goldValue = crop.sellPrice * stealAmount;

      // 更新偷取次数
      await prisma.land.update({
        where: { id: land.id },
        data: { stolenCount: { increment: 1 } }
      });

      // 给偷菜者增加金币
      const updatedStealer = await prisma.player.update({
        where: { id: stealerId },
        data: { gold: { increment: goldValue } }
      });

      // 创建偷菜记录
      const stealer = await prisma.player.findUnique({ where: { id: stealerId }, select: { name: true } });
      await prisma.stealRecord.create({
        data: {
          stealerId,
          victimId,
          landPos: position,
          cropType: land.cropType!,
          amount: stealAmount,
          goldValue
        }
      });

      // 发送通知
      await notifySteal(victimId, stealer?.name || 'Unknown', crop.name, stealAmount, position);

      // 更新 Redis 金币排行榜
      updateLeaderboard('gold', stealerId, updatedStealer.gold).catch(console.error);

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
      // 3. 释放锁
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