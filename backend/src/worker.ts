// backend/src/worker.ts

import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { redisClient, QUEUE_STEAL_EVENTS, QUEUE_SOCIAL_EVENTS, QUEUE_CARE_EVENTS, QUEUE_SHOVEL_EVENTS } from './utils/redis';
import { broadcast } from './utils/websocket';

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
        message: `${follower.name} 关注了你！`,
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
      const mutualMsgA = `你和 ${following.name} 互相关注，现在是好友了！`;
      const mutualMsgB = `你和 ${follower.name} 互相关注，现在是好友了！`;

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
 * 处理偷菜事件
 */
async function processStealEvent(event: any) {
  const { type, stealerId, stealerName, victimId, victimName, position, timestamp } = event;
  const time = new Date(timestamp);

  try {
    if (type === 'STEAL_SUCCESS') {
      const { cropName, cropType, amount, goldValue } = event;

      // 1. 异步写通知 (Notification)
      await prisma.notification.create({
        data: {
          playerId: victimId,
          type: 'stolen',
          message: `${stealerName} 偷走了你位置 ${position} 的 ${amount} 个 ${cropName}！`,
          data: JSON.stringify({ stealerName, cropName, amount, position })
        }
      });

      // 2. 异步广播 (WebSocket + Redis Log)
      await broadcast({
        type: 'action',
        action: 'STEAL',
        playerId: stealerId,
        playerName: stealerName,
        details: `从 ${victimName} 偷走了 ${cropName}`,
        timestamp: time.toISOString()
      });

      console.log(`[Worker] 🥬 Processed STEAL: ${stealerName} -> ${victimName}`);

    } else if (type === 'DOG_BITTEN') {
      const { penalty } = event;

      // 1. 写被咬通知
      await prisma.notification.create({
        data: {
          playerId: victimId, // 告诉狗主人狗咬到人了
          type: 'dog_bite',
          message: `你的狗咬住了 ${stealerName}，捡到了 ${penalty} 金币！`,
          data: JSON.stringify({ stealerName, penalty })
        }
      });

      // 2. 广播
      await broadcast({
        type: 'action',
        action: 'STEAL_FAIL',
        playerId: stealerId,
        playerName: stealerName,
        details: `去 ${victimName} 家偷菜被狗咬了，损失 ${penalty} 金币！`,
        timestamp: time.toISOString()
      });

      console.log(`[Worker] 🐕 Processed BITE: ${stealerName} bitten at ${victimName}`);
    }
  } catch (err) {
    console.error(`[Worker] ❌ Error processing steal event:`, err);
  }
}

/**
 * 处理照料事件 (浇水/除草/除虫)
 */
async function processCareEvent(event: any) {
  const { operatorId, operatorName, ownerId, position, careType, careTypeName, expReward, timestamp } = event;
  const time = new Date(timestamp);

  try {
    // 获取土地所有者名字
    const owner = await prisma.player.findUnique({
      where: { id: ownerId },
      select: { name: true }
    });
    if (!owner) return;

    // 发送照料通知给土地所有者
    await prisma.notification.create({
      data: {
        playerId: ownerId,
        type: 'care',
        message: `${operatorName} 给你的位置 ${position} 浇了水！`,
        data: JSON.stringify({ operatorId, operatorName, position, careType, expReward })
      }
    });

    // 广播
    await broadcast({
      type: 'action',
      action: 'CARE',
      playerId: operatorId,
      playerName: operatorName,
      details: `给 ${owner.name} 的土地 ${careTypeName} (+${expReward} 经验)`,
      timestamp: time.toISOString()
    });

    console.log(`[Worker] 💧 Processed CARE: ${operatorName} -> ${owner.name} (${careTypeName})`);

  } catch (err) {
    console.error(`[Worker] ❌ Error processing care event:`, err);
  }
}

/**
 * 处理铲除枯萎作物事件
 */
async function processShovelEvent(event: any) {
  const { operatorId, operatorName, ownerId, position, expReward, timestamp } = event;
  const time = new Date(timestamp);

  try {
    // 获取土地所有者名字
    const owner = await prisma.player.findUnique({
      where: { id: ownerId },
      select: { name: true }
    });
    if (!owner) return;

    // 发送铲除通知给土地所有者
    await prisma.notification.create({
      data: {
        playerId: ownerId,
        type: 'shovel',
        message: `${operatorName} 帮你铲除了位置 ${position} 的枯萎作物！`,
        data: JSON.stringify({ operatorId, operatorName, position, expReward })
      }
    });

    // 广播
    await broadcast({
      type: 'action',
      action: 'SHOVEL',
      playerId: operatorId,
      playerName: operatorName,
      details: `帮 ${owner.name} 铲除枯萎作物 (+${expReward} 经验)`,
      timestamp: time.toISOString()
    });

    console.log(`[Worker] 🔧 Processed SHOVEL: ${operatorName} -> ${owner.name}`);

  } catch (err) {
    console.error(`[Worker] ❌ Error processing shovel event:`, err);
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

  console.log('👷 Worker is listening for events (Steal & Social & Care & Shovel)...');

  while (true) {
    try {
      // 阻塞式拉取，同时监听四个队列
      const result = await redisClient.brPop([
        QUEUE_STEAL_EVENTS,
        QUEUE_SOCIAL_EVENTS,
        QUEUE_CARE_EVENTS,
        QUEUE_SHOVEL_EVENTS
      ], 0);

      if (result) {
        const { key, element } = result;
        const event = JSON.parse(element);

        if (key === QUEUE_STEAL_EVENTS) {
          await processStealEvent(event);
        } else if (key === QUEUE_SOCIAL_EVENTS) {
          await processSocialEvent(event);
        } else if (key === QUEUE_CARE_EVENTS) {
          await processCareEvent(event);
        } else if (key === QUEUE_SHOVEL_EVENTS) {
          await processShovelEvent(event);
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