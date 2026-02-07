// backend/src/worker-logs.ts

import { Worker } from 'bullmq';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { connection, QUEUE_NAME_LOGS } from './utils/queue';

dotenv.config();

console.log('📜 Log Worker (BullMQ) initializing...');

// 缓冲区配置
const BATCH_SIZE = 100;
const FLUSH_INTERVAL = 2000; // ms

// 本地内存缓冲，用于积攒日志
let logBuffer: any[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// 执行数据库写入
async function flushLogs() {
    if (logBuffer.length === 0) return;

    // 取出当前缓冲数据
    const batch = [...logBuffer];
    logBuffer = []; // 清空

    console.log(`[Logs] Flushing ${batch.length} logs to DB...`);

    try {
        await prisma.gameLog.createMany({
            data: batch.map(log => ({
                playerId: log.playerId,
                action: log.action,
                details: log.details,
                createdAt: new Date(log.createdAt)
            })),
            skipDuplicates: true
        });
    } catch (err) {
        console.error('[Logs] Error flushing logs to DB:', err);
        // 注意：如果是批量写入失败，这里的日志会丢失。
        // 对于高吞吐日志，通常接受"至多一次"交付。如果必须要保证不丢，需要更复杂的重试逻辑。
    }
}

// 启动定时器，防止日志量少时长时间不写入
function resetFlushTimer() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
        flushLogs();
        resetFlushTimer();
    }, FLUSH_INTERVAL);
}

// 初始化 Worker
const worker = new Worker(QUEUE_NAME_LOGS, async (job) => {
    // 1. 将任务数据推入本地缓冲
    // BullMQ 的 job.data 就是我们在 broadcast 里 add 的对象
    logBuffer.push(job.data);

    // 2. 如果缓冲满了，立即触发写入
    if (logBuffer.length >= BATCH_SIZE) {
        await flushLogs();
        // 重置定时器，避免刚写完又触发
        resetFlushTimer();
    }

    // 3. 立即返回，标记任务完成。
    // 我们不需要等待数据库写入才告诉 BullMQ 完成，因为我们已经在内存里接管了数据。
    return true;
}, {
    connection,
    concurrency: 1 // [重要] 必须单并发，确保 logBuffer 的线程安全
});

worker.on('failed', (job, err) => {
    console.error(`[Logs] Job ${job?.id} failed:`, err);
});

// 启动定时器
resetFlushTimer();

console.log(`✅ Log Worker started listening on queue: ${QUEUE_NAME_LOGS}`);