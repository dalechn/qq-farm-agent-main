// backend/src/utils/clickhouse.ts

import { createClient } from '@clickhouse/client';
import dotenv from 'dotenv';

dotenv.config();

// ==========================================
// 1. 创建 ClickHouse 客户端实例
// ==========================================
const clickhouse = createClient({
    url: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    request_timeout: 10000,
});

// 默认导出客户端，供 src/api/game.ts 进行查询使用
export default clickhouse;

// ==========================================
// 2. 初始化数据库结构 (在 src/index.ts 启动时调用)
// ==========================================
export async function initClickHouseSchema() {
    console.log('🐘 Initializing ClickHouse schema...');

    try {
        // 0. 创建数据库
        await clickhouse.command({
            query: `CREATE DATABASE IF NOT EXISTS qq_farm_logs`,
        });

        // =========================================================
        // ⚠️ 自动清理旧表逻辑
        // 为了让新的索引 (ORDER BY player_id) 和过滤规则生效，
        // 我们在启动时尝试删除旧表并重建。
        // (生产环境如果数据很重要，请注释掉下面这三行 DROP 语句)
        // =========================================================
        await clickhouse.command({ query: `DROP TABLE IF EXISTS qq_farm_logs.mv_game_logs` });
        await clickhouse.command({ query: `DROP TABLE IF EXISTS qq_farm_logs.kafka_queue` });
        await clickhouse.command({ query: `DROP TABLE IF EXISTS qq_farm_logs.game_logs` });

        // 1. 创建存储表 (Target Table)
        // 优化：
        // - 提取 player_id 和 action 为独立列
        // - 使用 (player_id, timestamp) 作为排序键，极大加速按玩家查询
        await clickhouse.command({
            query: `
        CREATE TABLE IF NOT EXISTS qq_farm_logs.game_logs
        (
            timestamp DateTime,
            player_id String,   -- [新增] 提取出来的玩家ID
            action String,      -- [新增] 动作类型
            container_id String,
            container_name String,
            log String          -- 原始完整 JSON
        ) ENGINE = MergeTree()
        ORDER BY (player_id, timestamp)
      `,
        });

        // 2. 创建 Kafka 引擎表 (Source Table)
        // 负责对接 Kafka 的 game-logs-topic
        await clickhouse.command({
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
            kafka_group_name = 'clickhouse_group_v2',
            kafka_format = 'JSONEachRow'
      `,
        });

        // 3. 创建物化视图 (ETL & Filter)
        // 负责从 Kafka 搬运数据到存储表
        await clickhouse.command({
            query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS qq_farm_logs.mv_game_logs TO qq_farm_logs.game_logs
        AS SELECT
            timestamp,
            -- [提取] 从 JSON 中提取 playerId，如果没有则为空
            JSONExtractString(log, 'playerId') AS player_id,
            -- [提取] 从 JSON 中提取 action
            JSONExtractString(log, 'action') AS action,
            container_id,
            container_name,
            log
        FROM qq_farm_logs.kafka_queue
        WHERE 
            -- [过滤] 关键：只有包含 'action' 字段的日志才写入
            -- 这会自动丢弃 Docker 产生的 "Server started" 等无用系统日志
            JSONHas(log, 'action') = 1
      `,
        });

        console.log('✅ ClickHouse schema initialized successfully.');
    } catch (error) {
        console.error('❌ Failed to initialize ClickHouse:', error);
    }
}