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

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

import { GameService } from './services/GameService';

// ==================== 注册路由 ====================
app.use('/api', gameRoutes);

// ==================== 服务器启动 ====================

const PORT = process.env.PORT || 3001;

async function start() {
  await connectRedis();
  await initClickHouseSchema();

  // 初始化或更新作物数据
  console.log(' Initializing crops...');

  // 循环更新或创建作物配置 (使用导入的 CROPS)
  for (const crop of CROPS) {
    await prisma.crop.upsert({
      where: { type: crop.type },
      update: crop,
      create: crop,
    });
  }
  console.log(` Crops data synced (${CROPS.length} types).`);

  // 预热排行榜
  await GameService.prewarmLeaderboards();

  const server = createServer(app);
  setupWebSocket(server);



  server.listen(PORT, () => {
    console.log(` Backend running on http://localhost:${PORT}`);
    console.log(` WebSocket available at ws://localhost:${PORT}/ws`);
  });
}

start();