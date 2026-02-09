// backend/src/auth-server.ts

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { connectRedis } from './utils/redis';
import socialRoutes from './api/social';
import playerRoutes from './api/players';
import { syncFollowsToRedis } from './utils/sync';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.AUTH_PORT || 3002; // 使用不同于游戏服的端口

// 注册路由 (从原 players.ts 迁移过来)

// 健康检查
app.get('/api/auth/health', (req, res) => {
  res.json({ status: 'Auth Server Online' });
});
app.use('/api/auth', socialRoutes);
app.use('/api/auth', playerRoutes);

async function startServer() {
  // 连接 Redis (因为日志和社交功能需要)
  await connectRedis();

  // 启动时同步关注关系 (非阻塞，让它在后台跑)
  syncFollowsToRedis().catch(err => console.error('Sync failed:', err));

  app.listen(PORT, () => {
    console.log(`🛡️  Auth Server running on http://localhost:${PORT}`);
  });
}

startServer();