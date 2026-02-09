// backend/ecosystem.config.js
module.exports = {
    apps: [
        {
            // 1. 游戏主服务
            name: 'farm-backend',
            script: './dist/index.js', // [修正] 去掉了 src/
            // instances: 'max',
            // exec_mode: 'cluster',
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 3001
            },
            merge_logs: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss"
        },
        {
            // 2. 数据同步 Worker
            name: 'farm-worker-sync',
            script: './dist/worker-sync.js', // [修正] 去掉了 src/
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production'
            },
            merge_logs: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss"
        },
        {
            // 3. 日志 Worker
            name: 'farm-worker-logs',
            script: './dist/worker-logs.js', // [修正] 去掉了 src/
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production'
            },
            merge_logs: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss"
        },
        {
            // 4. 排行榜 Worker
            name: 'farm-worker-leaderboard',
            script: './dist/worker-leaderboard.js', // [修正] 去掉了 src/
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production'
            },
            merge_logs: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss"
        }
    ]
};