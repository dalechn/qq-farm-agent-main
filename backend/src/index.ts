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
  
  // 初始化或更新作物数据
  // 使用 upsert 确保现有数据能更新字段，新数据能被创建
  console.log('🌱 Initializing crops...');
  
  const crops = [
    // --- 基础单季作物 ---
    { 
      type: 'radish', 
      name: '白萝卜', 
      seedPrice: 10, 
      sellPrice: 15, 
      matureTime: 30, // 30秒
      exp: 2, 
      yield: 1,
      maxHarvests: 1, 
      regrowTime: 0 
    },
    { 
      type: 'carrot', 
      name: '胡萝卜', 
      seedPrice: 20, 
      sellPrice: 35, 
      matureTime: 60, // 1分钟
      exp: 5, 
      yield: 1,
      maxHarvests: 1, 
      regrowTime: 0 
    },
    { 
      type: 'potato', // [新增]
      name: '土豆', 
      seedPrice: 150, 
      sellPrice: 280, 
      matureTime: 600, // 10分钟
      exp: 40, 
      yield: 1,
      maxHarvests: 1, 
      regrowTime: 0 
    },

    // --- 多季作物 (一次种植，多次收获) ---
    { 
      type: 'corn', 
      name: '玉米', 
      seedPrice: 50, 
      sellPrice: 60, 
      matureTime: 120, // 2分钟
      exp: 10, 
      yield: 2,
      maxHarvests: 5,   // 可收获5次
      regrowTime: 60    // 每次收获后60秒再生
    },
    { 
      type: 'strawberry', 
      name: '草莓', 
      seedPrice: 80, 
      sellPrice: 100, 
      matureTime: 180, // 3分钟
      exp: 15, 
      yield: 2,
      maxHarvests: 3,   // 可收获3次
      regrowTime: 90    // 90秒再生
    },
    { 
      type: 'tomato', // [新增]
      name: '番茄', 
      seedPrice: 200, 
      sellPrice: 180, 
      matureTime: 240, // 4分钟
      exp: 20, 
      yield: 2,
      maxHarvests: 4,   // 可收获4次
      regrowTime: 120   // 2分钟再生
    },

    // --- 高级作物 ---
    { 
      type: 'watermelon', 
      name: '西瓜', 
      seedPrice: 150, 
      sellPrice: 120, 
      matureTime: 300, // 5分钟
      exp: 25, 
      yield: 3,
      maxHarvests: 1,   // 西瓜通常收一次
      regrowTime: 0 
    },
    {
      type: 'pumpkin', // [新增]
      name: '南瓜',
      seedPrice: 500,
      sellPrice: 1200,
      matureTime: 1800, // 30分钟
      exp: 100,
      yield: 1,
      maxHarvests: 1,
      regrowTime: 0
    }
  ];

  // 循环更新或创建作物配置
  for (const crop of crops) {
    await prisma.crop.upsert({
      where: { type: crop.type },
      update: crop,
      create: crop,
    });
  }
  console.log(`✅ Crops data synced (${crops.length} types).`);

  const server = createServer(app);
  setupWebSocket(server);

  server.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket available at ws://localhost:${PORT}/ws`);
  });
}

start();