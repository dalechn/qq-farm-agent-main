import { createClient } from '@clickhouse/client';
import dotenv from 'dotenv';

dotenv.config();

const client = createClient({
    url: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
});

export async function initClickHouseSchema() {
    console.log('🐘 Initializing ClickHouse schema...');

    try {
        // 0. 创建数据库
        await client.command({
            query: `CREATE DATABASE IF NOT EXISTS qq_farm_logs`,
        });

        // =========================================================
        // ⚠️ 注意：为了应用新的表结构（加索引、加字段），我们需要先删除旧表。
        // 如果你已经有重要数据，请先备份。开发阶段直接删没问题。
        // =========================================================
        console.log('   Running cleanup for schema update...');
        await client.command({ query: `DROP TABLE IF EXISTS qq_farm_logs.mv_game_logs` });
        await client.command({ query: `DROP TABLE IF EXISTS qq_farm_logs.kafka_queue` });
        // 如果只是想修改视图逻辑，这行可以注释掉；但如果要改 ORDER BY 索引，必须删表重建
        await client.command({ query: `DROP TABLE IF EXISTS qq_farm_logs.game_logs` });

        // 1. 创建存储表 (Target Table)
        // 变化：增加了 player_id 和 action 字段，并把 player_id 加入了索引
        await client.command({
            query: `
        CREATE TABLE IF NOT EXISTS qq_farm_logs.game_logs
        (
            timestamp DateTime,
            player_id String,   -- [新增] 提取出来的玩家ID
            action String,      -- [新增] 动作类型 (PLANT, HARVEST...)
            container_id String,
            container_name String,
            log String          -- 原始完整 JSON
        ) ENGINE = MergeTree()
        -- [关键优化] 优先按 player_id 排序，这样查 "某个玩家的所有日志" 速度极快
        ORDER BY (player_id, timestamp)
      `,
        });

        // 2. 创建 Kafka 引擎表 (Source Table)
        // 这一步保持不变，它负责对接 Kafka 的原始数据
        await client.command({
            query: `
        CREATE TABLE IF NOT EXISTS qq_farm_logs.kafka_queue
        (
            timestamp DateTime,
            container_id String,
            container_name String,
            log String
        ) ENGINE = Kafka()
        SETTINGS
            kafka_broker_list = 'kafka:9092',
            kafka_topic_list = 'game-logs-topic',
            kafka_group_name = 'clickhouse_group_v2', -- 改个名防止消费组冲突
            kafka_format = 'JSONEachRow'
      `,
        });

        // 3. 创建物化视图 (ETL Logic)
        // 变化：
        // A. 使用 JSONExtractString 从 log 字符串里把 player_id 扣出来
        // B. 增加了 WHERE 条件，自动丢弃没有 action 的日志 (即 Docker 的系统杂音)
        await client.command({
            query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS qq_farm_logs.mv_game_logs TO qq_farm_logs.game_logs
        AS SELECT
            timestamp,
            -- [提取] 如果 JSON 里有 playerId 就提取，没有就是空字符串
            JSONExtractString(log, 'playerId') AS player_id,
            -- [提取] 提取动作类型
            JSONExtractString(log, 'action') AS action,
            container_id,
            container_name,
            log
        FROM qq_farm_logs.kafka_queue
        WHERE 
            -- [过滤] 只有包含 'action' 字段的日志才写入 ClickHouse
            -- 这样 "Server started", "Redis connected" 等系统日志会被直接丢弃
            JSONHas(log, 'action') = 1
      `,
        });

        console.log('✅ ClickHouse schema initialized successfully (with Player Indexing & Filtering).');
    } catch (error) {
        console.error('❌ Failed to initialize ClickHouse:', error);
    } finally {
        await client.close();
    }
}