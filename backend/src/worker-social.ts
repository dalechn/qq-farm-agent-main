// backend/src/worker-social.ts

import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { redisClient, KEYS } from './utils/redis';

dotenv.config();

console.log('🚀 Social Worker initializing (Stream Mode)...');

// 专用阻塞客户端
const blockingClient = redisClient.duplicate();
blockingClient.on('error', (err) => console.error('Social Worker Redis Error', err));

async function initStream() {
    try {
        // 建立 Consumer Group
        await redisClient.xGroupCreate(KEYS.MQ_SOCIAL_EVENTS, KEYS.GROUP_NAME_SYNC, '0', { MKSTREAM: true });
        console.log('✅ Social Consumer Group created');
    } catch (e: any) {
        if (e.message.includes('BUSYGROUP')) {
            // Group 已存在，忽略
        } else {
            console.error('❌ Failed to create Social Group:', e);
        }
    }
}

async function processSocialEvents() {
    try {
        // 1. 阻塞读取消息
        const response = await blockingClient.xReadGroup(
            KEYS.GROUP_NAME_SYNC,
            `${KEYS.CONSUMER_NAME}-social`, // 区分 consumer name
            { key: KEYS.MQ_SOCIAL_EVENTS, id: '>' },
            { COUNT: 10, BLOCK: 5000 }
        );

        if (!response || response.length === 0) return;

        const streamEntry = response[0];
        const messages = streamEntry.messages;

        if (messages.length === 0) return;

        console.log(`[Social] Processing ${messages.length} events...`);

        for (const msg of messages) {
            const { action, followerId, followingId, isMutual, ts } = msg.message;
            const msgId = msg.id;

            try {
                if (action === 'FOLLOW') {
                    await handleFollow(followerId, followingId, isMutual === 'true', new Date(Number(ts)));
                } else if (action === 'UNFOLLOW') {
                    await handleUnfollow(followerId, followingId);
                }

                // ACK 消息
                await redisClient.xAck(KEYS.MQ_SOCIAL_EVENTS, KEYS.GROUP_NAME_SYNC, msgId);

            } catch (err) {
                console.error(`[Social] Error processing msg ${msgId}:`, err);
                // 不 ACK，稍后会被 pending claim 机制或重试处理 (简化版这里暂不处理 DLQ)
            }
        }

    } catch (err) {
        console.error('[Social] Loop error:', err);
        await new Promise(r => setTimeout(r, 2000)); // 防止死循环
    }
}

// 业务逻辑：处理关注 (落库 + 通知)
async function handleFollow(followerId: string, followingId: string, isMutual: boolean, createdAt: Date) {
    // 1. 写入 DB (upsert 防止重复)
    // 使用 prisma.$transaction 确保数据一致性 (虽然这里主要是 create)
    try {
        const exists = await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId, followingId } }
        });

        if (!exists) {
            await prisma.follow.create({
                data: { followerId, followingId, createdAt }
            });
            console.log(`[DB] Synced follow: ${followerId} -> ${followingId}`);
        }
    } catch (e) {
        console.error('DB Write Follow Error', e);
    }

    // 2. 发送通知 (逻辑迁移自旧 Worker)
    const follower = await prisma.player.findUnique({ where: { id: followerId }, select: { name: true } });
    const following = await prisma.player.findUnique({ where: { id: followingId }, select: { name: true } });

    if (!follower || !following) return;

    // 通知被关注者
    await prisma.notification.create({
        data: {
            playerId: followingId,
            type: 'new_follower',
            message: `${follower.name} followed you!`,
            data: JSON.stringify({ followerId, followerName: follower.name })
        }
    });

    // 如果是互粉，发送好友通知
    if (isMutual) {
        await prisma.notification.createMany({
            data: [
                {
                    playerId: followerId,
                    type: 'mutual_follow',
                    message: `You and ${following.name} are now friends!`,
                    data: JSON.stringify({ friendId: followingId, friendName: following.name })
                },
                {
                    playerId: followingId,
                    type: 'mutual_follow',
                    message: `You and ${follower.name} are now friends!`,
                    data: JSON.stringify({ friendId: followerId, friendName: follower.name })
                }
            ]
        });
        console.log(`[Notify] Mutual follow notifications sent`);
    }
}

// 业务逻辑：处理取关
async function handleUnfollow(followerId: string, followingId: string) {
    try {
        const exists = await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId, followingId } }
        });

        if (exists) {
            await prisma.follow.delete({
                where: { id: exists.id }
            });
            console.log(`[DB] Synced unfollow: ${followerId} -x> ${followingId}`);
        }
    } catch (e) {
        console.error('DB Write Unfollow Error', e);
    }
}

async function start() {
    await redisClient.connect();
    await blockingClient.connect();

    await initStream();

    console.log('👂 Social Worker listening on Redis Stream...');
    while (true) {
        await processSocialEvents();
    }
}

start();