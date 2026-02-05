import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import prisma from './utils/prisma';
import { connectRedis } from './utils/redis';
import { setupWebSocket } from './utils/websocket';

// 引入新拆分的路由
import playerRoutes from './api/players';
import gameRoutes from './api/game';
import socialRoutes from './api/social';
import systemRoutes from './api/system';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ==================== 注册路由 ====================
app.use('/api', playerRoutes);
app.use('/api', gameRoutes);
app.use('/api', socialRoutes);
app.use('/api', systemRoutes);

// ==================== 服务器启动 ====================

const PORT = process.env.PORT || 3001;

async function start() {
  await connectRedis();
  
  // 初始化作物数据
  const cropCount = await prisma.crop.count();
  if (cropCount === 0) {
    await prisma.crop.createMany({
      data: [
        { type: 'radish', name: '白萝卜', seedPrice: 10, sellPrice: 15, matureTime: 30, exp: 2 },
        { type: 'carrot', name: '胡萝卜', seedPrice: 20, sellPrice: 35, matureTime: 60, exp: 5 },
        { type: 'corn', name: '玉米', seedPrice: 50, sellPrice: 60, matureTime: 120, exp: 10, yield: 2 },
        { type: 'strawberry', name: '草莓', seedPrice: 80, sellPrice: 100, matureTime: 180, exp: 15, yield: 2 },
        { type: 'watermelon', name: '西瓜', seedPrice: 150, sellPrice: 120, matureTime: 300, exp: 25, yield: 3 }
      ]
    });
    console.log('🌱 Default crops initialized');
  }

  const server = createServer(app);
  setupWebSocket(server);

  server.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket available at ws://localhost:${PORT}/ws`);
  });
}

start();