// backend/src/worker-logs.ts

import { Worker } from 'bullmq';
import dotenv from 'dotenv';
import clickhouse from './utils/clickhouse';
import { connection, QUEUE_NAME_LOGS } from './utils/queue';

dotenv.config();

console.log('📜 Log Worker (BullMQ -> ClickHouse) initializing...');

// 缓冲区配置
const BATCH_SIZE = 100;
const FLUSH_INTERVAL = 2000; // ms

// 本地内存缓冲
let logBuffer: any[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// 执行数据库写入 (ClickHouse)
async function flushLogs() {
    if (logBuffer.length === 0) return;

    // 取出当前缓冲数据
    const batch = [...logBuffer];
    logBuffer = []; // 清空

    console.log(`[Logs] Flushing ${batch.length} logs to ClickHouse...`);

    try {
        // [修改] 将变量名从 log 改为 entry，避免和下面的 log 字段混淆
        const rows = batch.map(entry => {
            // [修复] 处理时间格式
            // 优先使用 timestamp (ActionLog 标准字段)，如果没有则尝试 createdAt 或当前时间
            const d = new Date(entry.timestamp || entry.createdAt || Date.now());
            const timestampInSeconds = Math.floor(d.getTime() / 1000);

            // [关键修复] 构建一个安全的 log 对象
            // 强制将 details 转换为字符串，防止前端 React 渲染对象时报错
            const safeLog = {
                ...entry,
                details: typeof entry.details === 'object' ? JSON.stringify(entry.details) : String(entry.details || '')
            };

            return {
                timestamp: timestampInSeconds,
                player_id: entry.playerId ? String(entry.playerId) : '',
                action: entry.action ? String(entry.action) : 'UNKNOWN',
                container_id: 'worker-node',
                container_name: 'backend-worker',
                log: JSON.stringify(safeLog) // 使用清洗后的对象进行序列化
            };
        });

        await clickhouse.insert({
            table: 'qq_farm_logs.game_logs',
            values: rows,
            format: 'JSONEachRow'
        });

    } catch (err) {
        console.error('[Logs] Error flushing logs to ClickHouse:', err);
    }
}

// 启动定时器
function resetFlushTimer() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
        flushLogs();
        resetFlushTimer();
    }, FLUSH_INTERVAL);
}

// 初始化 Worker
const worker = new Worker(QUEUE_NAME_LOGS, async (job) => {
    // 确保 job.data 存在
    if (job && job.data) {
        logBuffer.push(job.data);
    }

    if (logBuffer.length >= BATCH_SIZE) {
        await flushLogs();
        resetFlushTimer();
    }

    return true;
}, {
    connection,
    concurrency: 1
});

worker.on('failed', (job, err) => {
    console.error(`[Logs] Job ${job?.id} failed:`, err);
});

resetFlushTimer();

console.log(`✅ Log Worker started listening on queue: ${QUEUE_NAME_LOGS}`);