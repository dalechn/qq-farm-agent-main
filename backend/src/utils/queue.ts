// backend/src/utils/queue.ts

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// BullMQ 需要使用 ioredis，而不是 node-redis
// maxRetriesPerRequest 必须为 null，这是 BullMQ 的要求
const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
});

// 定义队列名称
export const QUEUE_NAME_SOCIAL = 'social-events';

// 创建队列实例 (用于生产者/Service端)
export const socialQueue = new Queue(QUEUE_NAME_SOCIAL, {
    connection,
    defaultJobOptions: {
        attempts: 3, // 如果失败，自动重试3次
        backoff: {
            type: 'exponential',
            delay: 1000, // 重试间隔
        },
        removeOnComplete: 100, // 只保留最近100条完成记录，防止Redis爆满
        removeOnFail: 500,     // 保留最近500条失败记录用于排查
    },
});

// 导出连接供 Worker 复用
export { connection };