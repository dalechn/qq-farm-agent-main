// backend/src/worker.ts

import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { redisClient, QUEUE_SOCIAL_EVENTS, QUEUE_FARM_EVENTS } from './utils/redis';
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
          message: `${stealerName} stole your ${cropName} (${amount}) at position ${position}!`,
          data: JSON.stringify({ stealerName, cropName, amount, position })
        }
      });

      // 2. 异步广播 (WebSocket + Redis Log)
      await broadcast({
        type: 'action',
        action: 'STEAL',
        playerId: stealerId,
        playerName: stealerName,
        details: `Stole ${cropName} from ${victimName}`,
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
          message: `Your dog caught ${stealerName}, you got ${penalty} gold!`,
          data: JSON.stringify({ stealerName, penalty })
        }
      });

      // 2. 广播
      await broadcast({
        type: 'action',
        action: 'STEAL_FAIL',
        playerId: stealerId,
        playerName: stealerName,
        details: `Bitten by ${victimName}'s dog while stealing! Lost ${penalty} gold`,
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
  const { operatorId, operatorName, ownerId, position, careType, careTypeName, expReward, isSelfOperation, timestamp } = event;
  const time = new Date(timestamp);

  try {
    // 如果是帮别人照料，发送通知给自己
    if (!isSelfOperation) {
      // 获取操作者名字
      const operator = await prisma.player.findUnique({
        where: { id: operatorId },
        select: { name: true }
      });
      if (!operator) return;

      await prisma.notification.create({
        data: {
          playerId: ownerId,
          type: 'care',
          message: `${operatorName} ${careTypeName} your crop at position ${position}!`,
          data: JSON.stringify({ operatorId, operatorName, position, careType, expReward })
        }
      });
    }

    // 广播
    await broadcast({
      type: 'action',
      action: 'CARE',
      playerId: operatorId,
      playerName: operatorName,
      details: `${careTypeName} ${isSelfOperation ? 'own crop' : ownerId + "'s land"} (+${expReward} exp)`,
      timestamp: time.toISOString()
    });

    console.log(`[Worker] 💧 Processed CARE: ${operatorName} ${isSelfOperation ? '(self)' : '-> ' + ownerId} (${careTypeName})`);

  } catch (err) {
    console.error(`[Worker] ❌ Error processing care event:`, err);
  }
}

/**
 * 处理铲除枯萎作物事件
 */
async function processShovelEvent(event: any) {
  const { operatorId, operatorName, ownerId, position, expReward, isSelfOperation, timestamp } = event;
  const time = new Date(timestamp);

  try {
    // 如果是帮别人铲除，发送通知给土地所有者
    if (!isSelfOperation) {
      await prisma.notification.create({
        data: {
          playerId: ownerId,
          type: 'shovel',
          message: `${operatorName} cleared your withered crop at position ${position}!`,
          data: JSON.stringify({ operatorId, operatorName, position, expReward })
        }
      });
    }

    // 广播
    await broadcast({
      type: 'action',
      action: 'SHOVEL',
      playerId: operatorId,
      playerName: operatorName,
      details: `Cleared withered crop ${isSelfOperation ? '(self)' : 'for ' + ownerId} (+${expReward} exp)`,
      timestamp: time.toISOString()
    });

    console.log(`[Worker] 🔧 Processed SHOVEL: ${operatorName} ${isSelfOperation ? '(self)' : '-> ' + ownerId}`);

  } catch (err) {
    console.error(`[Worker] ❌ Error processing shovel event:`, err);
  }
}

/**
 * 处理种植事件
 */
async function processPlantEvent(event: any) {
  const { playerId, playerName, position, cropType, cropName, matureTime, timestamp } = event;
  const time = new Date(timestamp);

  try {
    // 广播
    await broadcast({
      type: 'action',
      action: 'PLANT',
      playerId,
      playerName,
      details: `Planted ${cropName} at position [${position}] (${matureTime}s to mature)`,
      timestamp: time.toISOString()
    });

    console.log(`[Worker] 🌱 Processed PLANT: ${playerName} -> position ${position} (${cropName})`);

  } catch (err) {
    console.error(`[Worker] ❌ Error processing plant event:`, err);
  }
}

/**
 * 处理收获事件
 */
async function processHarvestEvent(event: any) {
  const { playerId, playerName, position, cropType, cropName, gold, exp, penalty, nextSeason, isWithered, timestamp } = event;
  const time = new Date(timestamp);

  try {
    // 发送通知给自己
    let message = `Harvested +${gold} gold`;
    if (penalty > 0) message += ` (lost -${penalty} due to disasters)`;
    if (nextSeason) message += " (next season)";
    if (isWithered) message += " (crop withered)";

    // await prisma.notification.create({
    //   data: {
    //     playerId,
    //     type: 'harvest',
    //     message,
    //     data: JSON.stringify({ position, cropType, cropName, gold, exp, penalty, nextSeason, isWithered })
    //   }
    // });

    // 广播
    let details = `Harvested +${gold} gold`;
    if (penalty > 0) details += ` (-${penalty} penalty)`;
    if (nextSeason) details += " (next season)";
    if (isWithered) details += " (withered)";

    await broadcast({
      type: 'action',
      action: 'HARVEST',
      playerId,
      playerName,
      details,
      timestamp: time.toISOString()
    });

    console.log(`[Worker] 🌾 Processed HARVEST: ${playerName} -> ${cropName} (+${gold} gold)`);

  } catch (err) {
    console.error(`[Worker] ❌ Error processing harvest event:`, err);
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

  console.log('👷 Worker is listening for events (Social & Farm)...');

  while (true) {
    try {
      // 阻塞式拉取，监听两个队列
      const result = await redisClient.brPop([
        QUEUE_SOCIAL_EVENTS,
        QUEUE_FARM_EVENTS
      ], 0);

      if (result) {
        const { key, element } = result;
        const event = JSON.parse(element);

        if (key === QUEUE_SOCIAL_EVENTS) {
          await processSocialEvent(event);
        } else if (key === QUEUE_FARM_EVENTS) {
          // 根据事件 type 分发到对应的处理函数
          const eventType = event.type;
          if (eventType === 'STEAL_SUCCESS' || eventType === 'DOG_BITTEN') {
            await processStealEvent(event);
          } else if (eventType === 'CARE_EVENT') {
            await processCareEvent(event);
          } else if (eventType === 'SHOVEL_EVENT') {
            await processShovelEvent(event);
          } else if (eventType === 'PLANT_EVENT') {
            await processPlantEvent(event);
          } else if (eventType === 'HARVEST_EVENT') {
            await processHarvestEvent(event);
          } else {
            console.log(`[Worker] ⚠️ Unknown farm event type: ${eventType}`);
          }
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