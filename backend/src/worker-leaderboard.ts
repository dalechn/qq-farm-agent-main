import { redisClient, KEYS } from './utils/redis';

const SYNC_INTERVAL = 60 * 1000; // 60秒
const BATCH_SIZE = 500; // 每次从 Redis 取 500 个 ID 处理

export function startLeaderboardWorker() {
    console.log(`🏆 [Leaderboard Worker] Started. Sync interval: ${SYNC_INTERVAL}ms`);

    setInterval(async () => {
        await processDirtyRanks();
    }, SYNC_INTERVAL);
}

export async function processDirtyRanks() {
    try {
        // 1. 检查有多少脏数据
        const totalDirty = await redisClient.sCard(KEYS.LEADERBOARD_DIRTY);
        if (totalDirty === 0) return;

        console.log(`⚡ [Leaderboard] Syncing ${totalDirty} players...`);
        const startTime = Date.now();

        let processed = 0;

        // 分批处理，避免一次性阻塞 Node.js 事件循环
        while (true) {
            // 2. 原子性弹出 BATCH_SIZE 个玩家 ID, 使用 sendCommand 绕过类型定义不一致 (某些版本 types/redis 认为 sPop 只接受1个参数)
            const rawIds = await redisClient.sendCommand(['SPOP', KEYS.LEADERBOARD_DIRTY, BATCH_SIZE.toString()]);
            const playerIds = rawIds as unknown as string[];

            if (!playerIds || playerIds.length === 0) break;

            // 3. 准备 Pipeline
            const pipeline = redisClient.multi();

            // 3.1 批量读取玩家最新的 gold 和 level
            for (const id of playerIds) {
                pipeline.hmGet(KEYS.PLAYER(id), ['gold', 'level']);
            }

            const results = await pipeline.exec(); // execute read

            if (!results) continue;

            // 3.2 批量写入排行榜 (ZSET)
            const writePipeline = redisClient.multi();

            playerIds.forEach((id, index) => {
                // 这里的 results[index] 结构取决于 redis 版本，通常是 [err, [gold, level]] 或直接 [gold, level]
                // 我们假设使用 ioredis 或 node-redis v4+ 的标准行为
                // 注意：hmGet 返回的是数组
                const raw = results[index] as any;
                // 兼容处理：有些库返回 [null, data]，有些直接返回 data
                const data = Array.isArray(raw) && raw[0] === null ? raw[1] : raw;

                if (Array.isArray(data)) {
                    const gold = Number(data[0] || 0);
                    const level = Number(data[1] || 1);

                    // 更新三个排行榜
                    writePipeline.zAdd('leaderboard:gold', { score: gold, value: id });
                    writePipeline.zAdd('leaderboard:level', { score: level, value: id });
                    writePipeline.zAdd('leaderboard:active', { score: Date.now(), value: id });
                }
            });

            await writePipeline.exec(); // execute write
            processed += playerIds.length;
        }

        const duration = Date.now() - startTime;
        console.log(`✅ [Leaderboard] Synced ${processed} players in ${duration}ms`);

    } catch (error) {
        console.error('❌ [Leaderboard] Sync failed:', error);
    }
}
