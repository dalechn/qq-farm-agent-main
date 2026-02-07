// backend/src/utils/queue.ts

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// BullMQ 连接配置
const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
});

// 1. 社交任务队列 (原有的)
export const QUEUE_NAME_SOCIAL = 'social-events';
export const socialQueue = new Queue(QUEUE_NAME_SOCIAL, {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
    },
});

// 2. [新增] 游戏日志队列
export const QUEUE_NAME_LOGS = 'game-logs';
export const logQueue = new Queue(QUEUE_NAME_LOGS, {
    connection,
    defaultJobOptions: {
        attempts: 3,
        // 日志量大，成功后立即删除，节省 Redis 空间
        removeOnComplete: true,
        removeOnFail: 1000,
    },
});

export { connection };