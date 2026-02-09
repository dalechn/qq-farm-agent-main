// backend/src/index.ts

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import prisma from './utils/prisma';
import { connectRedis } from './utils/redis';
import { setupWebSocket } from './utils/websocket';
import { initClickHouseSchema } from './utils/init-clickhouse';

// 引入新拆分的路由
import gameRoutes from './api/game';
import { CROPS } from './utils/game-keys';
import { GameService } from './services/GameService';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ==================== 注册路由 ====================
app.use('/api', gameRoutes);

// ==================== 服务器启动 ====================

const PORT = process.env.PORT || 3001;

async function start() {
  await connectRedis();
  await initClickHouseSchema();

  // 初始化或更新作物数据
  console.log('🌱 Initializing crops...');

  // 循环更新或创建作物配置
  for (const crop of CROPS) {
    await prisma.crop.upsert({
      where: { type: crop.type },
      update: crop,
      create: crop,
    });
  }
  console.log(`✅ Crops data synced (${CROPS.length} types).`);

  // 预热排行榜 (启动时跑一次是可以的，或者也可以交给 worker 去做，保留在这里也没问题)
  await GameService.prewarmLeaderboards();

  // [修改] 移除了 startLeaderboardWorker() 调用
  // startLeaderboardWorker(); 

  const server = createServer(app);
  setupWebSocket(server);

  server.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket available at ws://localhost:${PORT}/ws`);
  });
}

start();