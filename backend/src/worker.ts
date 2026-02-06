// backend/src/worker.ts

import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { redisClient, QUEUE_SOCIAL_EVENTS } from './utils/redis';

dotenv.config();

console.log('👷 Worker process initializing...');

/**
 * 处理社交事件 (关注/互粉)
 */
async function processSocialEvent(event: any) {
  const { followerId, followingId, isMutual, timestamp } = event;

  try {
    // 1. 获取双方名字 (Worker 中查询，不占用 API 线程)
    const follower = await prisma.player.findUnique({
      where: { id: followerId },
      select: { name: true }
    });
    const following = await prisma.player.findUnique({
      where: { id: followingId },
      select: { name: true }
    });

    if (!follower || !following) return;

    // 2. 发送 "被关注" 通知 (DB + WS)
    await prisma.notification.create({
      data: {
        playerId: followingId,
        type: 'new_follower',
        message: `${follower.name} followed you!`,
        data: JSON.stringify({ followerId, followerName: follower.name })
      }
    });

    // sendToPlayer(followingId, {
    //   type: 'new_follower',
    //   followerId,
    //   followerName: follower.name
    // });

    // 3. 如果是互粉，处理 "好友达成" 通知 (双向)
    if (isMutual) {
      const mutualMsgA = `You and ${following.name} are now friends!`;
      const mutualMsgB = `You and ${follower.name} are now friends!`;

      // 通知 A (Follower)
      await prisma.notification.create({
        data: {
          playerId: followerId,
          type: 'mutual_follow',
          message: mutualMsgA,
          data: JSON.stringify({ friendId: followingId, friendName: following.name })
        }
      });
    //   sendToPlayer(followerId, {
    //     type: 'mutual_follow',
    //     friendId: followingId,
    //     friendName: following.name
    //   });

      // 通知 B (Following)
      await prisma.notification.create({
        data: {
          playerId: followingId,
          type: 'mutual_follow',
          message: mutualMsgB,
          data: JSON.stringify({ friendId: followerId, friendName: follower.name })
        }
      });
    //   sendToPlayer(followingId, {
    //     type: 'mutual_follow',
    //     friendId: followerId,
    //     friendName: follower.name
    //   });

      console.log(`[Worker] 🤝 Mutual Follow: ${follower.name} <-> ${following.name}`);
    } else {
      console.log(`[Worker] ➕ New Follow: ${follower.name} -> ${following.name}`);
    }

  } catch (err) {
    console.error(`[Worker] ❌ Error processing social event:`, err);
  }
}

/**
 * 启动 Worker 循环
 */
async function startWorker() {
  // 确保 Redis 连接
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  console.log('👷 Worker is listening for social events only...');

  while (true) {
    try {
      // 阻塞式拉取，只监听社交事件队列
      const result = await redisClient.brPop([QUEUE_SOCIAL_EVENTS], 0);

      if (result) {
        const { key, element } = result;
        const event = JSON.parse(element);

        if (key === QUEUE_SOCIAL_EVENTS) {
          await processSocialEvent(event);
        }
      }
    } catch (error) {
      console.error('[Worker] 💥 Loop error:', error);
      // 防止 Redis 断连或其他致命错误导致死循环刷屏，暂停 1 秒
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// 启动
startWorker();