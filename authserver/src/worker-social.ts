// backend/src/worker-social.ts

import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { redisClient, SOCIAL_KEYS } from './utils/redis';

dotenv.config();

console.log('🚀 Social Worker initializing (Stream Mode)...');

// 专用阻塞客户端 (用于监听新消息)
const blockingClient = redisClient.duplicate();
blockingClient.on('error', (err) => console.error('Social Worker Redis Error', err));

async function initStream() {
    try {
        await redisClient.xGroupCreate(SOCIAL_KEYS.MQ_EVENTS, SOCIAL_KEYS.GROUP_NAME, '0', { MKSTREAM: true });
        console.log('✅ Social Consumer Group created');
    } catch (e: any) {
        if (!e.message.includes('BUSYGROUP')) {
            console.error('❌ Failed to create Social Group:', e);
        }
    }
}

// ==========================================
// 核心逻辑封装
// ==========================================

/**
 * 处理单条消息并 ACK
 * @returns boolean 处理是否成功
 */
async function processStreamEntry(msg: any): Promise<boolean> {
    const { action, followerId, followingId, isMutual, ts } = msg.message;
    const msgId = msg.id;

    try {
        // 1. 执行业务逻辑
        if (action === 'FOLLOW') {
            await handleFollow(followerId, followingId, isMutual === 'true', new Date(Number(ts)));
        } else if (action === 'UNFOLLOW') {
            await handleUnfollow(followerId, followingId);
        }

        // 2. 只有 DB 写入成功，才 ACK
        await redisClient.xAck(SOCIAL_KEYS.MQ_EVENTS, SOCIAL_KEYS.GROUP_NAME, msgId);
        return true;

    } catch (err) {
        console.error(`[Social] Error processing msg ${msgId}:`, err);
        // 不 ACK，保留在 Pending List 中等待下一次处理或人工干预
        return false;
    }
}

/**
 * [新增] 启动时处理 Pending (未确认) 消息
 * 防止 Worker 挂掉导致消息一直卡在 Pending List
 */
async function processPendingEvents() {
    console.log('[Social] Checking for pending (unacknowledged) messages...');

    while (true) {
        try {
            // 读取 Pending 消息 (ID = '0')
            // 注意：这里使用普通 redisClient，不需要阻塞
            const response = await redisClient.xReadGroup(
                SOCIAL_KEYS.GROUP_NAME,
                SOCIAL_KEYS.CONSUMER_NAME,
                { key: SOCIAL_KEYS.MQ_EVENTS, id: '0' },
                { COUNT: 50 }
            );

            if (!response || response.length === 0) break;

            const streamEntry = response[0];
            const messages = streamEntry.messages;

            if (messages.length === 0) break;

            console.log(`[Social] Found ${messages.length} pending messages. Reprocessing...`);

            let successCount = 0;
            for (const msg of messages) {
                const success = await processStreamEntry(msg);
                if (success) successCount++;
            }

            // 防死循环：如果这一批消息全部失败（说明可能是坏数据或 Bug），
            // 则停止 Pending 处理，避免无限循环阻塞启动，直接进入主循环。
            if (successCount === 0 && messages.length > 0) {
                console.warn('[Social] ⚠️ Stuck on pending messages (all failed). Skipping pending check to enter main loop.');
                break;
            }

        } catch (err) {
            console.error('[Social] Error during pending processing:', err);
            break;
        }
    }
    console.log('[Social] Pending messages check complete.');
}

/**
 * 主循环：监听新消息
 */
async function processSocialEvents() {
    try {
        const response = await blockingClient.xReadGroup(
            SOCIAL_KEYS.GROUP_NAME,
            SOCIAL_KEYS.CONSUMER_NAME,
            { key: SOCIAL_KEYS.MQ_EVENTS, id: '>' }, // 读取新消息
            { COUNT: 10, BLOCK: 5000 }
        );

        if (!response || response.length === 0) return;

        const streamEntry = response[0];
        const messages = streamEntry.messages;

        if (messages.length === 0) return;

        console.log(`[Social] Processing ${messages.length} new events...`);

        for (const msg of messages) {
            await processStreamEntry(msg);
        }

    } catch (err) {
        console.error('[Social] Loop error:', err);
        await new Promise(r => setTimeout(r, 2000));
    }
}

// ==========================================
// 业务处理函数
// ==========================================

async function handleFollow(followerId: string, followingId: string, isMutual: boolean, createdAt: Date) {
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

        await sendFollowNotifications(followerId, followingId, isMutual);

    } catch (e) {
        console.error('DB Write Follow Error', e);
        throw e;
    }
}

async function handleUnfollow(followerId: string, followingId: string) {
    try {
        const exists = await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId, followingId } }
        });

        if (exists) {
            await prisma.follow.delete({ where: { id: exists.id } });
            console.log(`[DB] Synced unfollow: ${followerId} -x> ${followingId}`);
        }
    } catch (e) {
        console.error('DB Write Unfollow Error', e);
        throw e;
    }
}

async function sendFollowNotifications(followerId: string, followingId: string, isMutual: boolean) {
    try {
        const follower = await prisma.player.findUnique({ where: { id: followerId }, select: { name: true } });
        const following = await prisma.player.findUnique({ where: { id: followingId }, select: { name: true } });

        if (!follower || !following) return;

        await prisma.notification.create({
            data: {
                playerId: followingId,
                type: 'new_follower',
                message: `${follower.name} followed you!`,
                data: JSON.stringify({ followerId, followerName: follower.name })
            }
        });

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
        }
    } catch (e) {
        console.warn('Notification failed (ignoring):', e);
    }
}

// ==========================================
// 入口函数
// ==========================================

async function start() {
    await redisClient.connect();
    await blockingClient.connect();
    await initStream();

    // 1. 先处理遗留的 Pending 消息
    await processPendingEvents();

    console.log('👂 Social Worker listening on Redis Stream...');

    // 2. 进入主循环监听新消息
    while (true) {
        await processSocialEvents();
    }
}

start();