// backend/src/worker-social.ts

import { Worker, Job } from 'bullmq';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { connection, QUEUE_NAME_SOCIAL } from './utils/queue';

dotenv.config();

console.log('🚀 Social Worker initializing...');

/**
 * 具体的业务逻辑处理函数
 */
async function processSocialJob(job: Job) {
    const { followerId, followingId, isMutual } = job.data;

    console.log(`[Job ${job.id}] Processing follow: ${followerId} -> ${followingId} (Mutual: ${isMutual})`);

    // 1. 获取名字
    const follower = await prisma.player.findUnique({
        where: { id: followerId },
        select: { name: true }
    });
    const following = await prisma.player.findUnique({
        where: { id: followingId },
        select: { name: true }
    });

    if (!follower || !following) {
        console.warn(`[Job ${job.id}] Player not found, skipping.`);
        return;
    }

    // 2. 发送 "被关注" 通知
    await prisma.notification.create({
        data: {
            playerId: followingId,
            type: 'new_follower',
            message: `${follower.name} followed you!`,
            data: JSON.stringify({ followerId, followerName: follower.name })
        }
    });

    // 3. 互粉处理
    if (isMutual) {
        const mutualMsgA = `You and ${following.name} are now friends!`;
        const mutualMsgB = `You and ${follower.name} are now friends!`;

        // 通知 A
        await prisma.notification.create({
            data: {
                playerId: followerId,
                type: 'mutual_follow',
                message: mutualMsgA,
                data: JSON.stringify({ friendId: followingId, friendName: following.name })
            }
        });

        // 通知 B
        await prisma.notification.create({
            data: {
                playerId: followingId,
                type: 'mutual_follow',
                message: mutualMsgB,
                data: JSON.stringify({ friendId: followerId, friendName: follower.name })
            }
        });

        console.log(`[Job ${job.id}] 🤝 Mutual Follow Handled`);
    }
}

// 创建 Worker 实例
const worker = new Worker(QUEUE_NAME_SOCIAL, processSocialJob, {
    connection,
    concurrency: 5, // 同时处理5个并发任务
});

// 监听事件
worker.on('completed', (job) => {
    console.log(`✅ [Job ${job.id}] Completed`);
});

worker.on('failed', (job, err) => {
    console.error(`❌ [Job ${job?.id}] Failed: ${err.message}`);
});

console.log(`👂 Social Worker is listening on queue: ${QUEUE_NAME_SOCIAL}`);

// 优雅退出
process.on('SIGTERM', async () => {
    await worker.close();
    process.exit(0);
});