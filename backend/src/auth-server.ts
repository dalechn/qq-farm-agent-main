// backend/src/auth-server.ts

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { GAME_CONFIG, LandStatus } from './utils/game-keys'; // [修改] 引入 LandStatus
import { connectRedis } from './utils/redis';
import socialRoutes from './api/social';
import playerRoutes from './api/players';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.AUTH_PORT || 3002; // 使用不同于游戏服的端口

// 注册路由 (从原 players.ts 迁移过来)
app.post('/api/auth/player', async (req: any, res: any) => {
  const { name, twitter } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  // 检查名字是否已存在 (Prisma 设有 unique 约束，这里先查更友好)
  try {
    const existing = await prisma.player.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: 'Name already taken' });
    }

    const avatar = `https://robohash.org/${encodeURIComponent(name)}.png?set=set1`;

    // 从配置读取初始土地数量
    const initialLandCount = GAME_CONFIG.LAND.INITIAL_COUNT;

    // [修复] 针对 JSON 类型的 lands 字段，直接生成数组数据
    // 不要使用 { create: ... } 这种关系型写法，否则会被当成 JSON 对象存入 DB
    const initialLands = Array.from({ length: initialLandCount }).map((_, i) => ({
      position: i,
      id: i.toString(),
      status: 'empty', // 明确写入默认值
      landType: 'normal',
      stolenCount: 0,
      remainingHarvests: 0
    }));

    const player = await prisma.player.create({
      data: {
        name,
        avatar,
        twitter,
        // 直接存入数组
        lands: initialLands as any
      }
    });

    console.log(`[Auth] New player registered: ${player.name} (${player.id})`);
    res.status(201).json(player);

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

// 健康检查
app.get('/api/auth/health', (req, res) => {
  res.json({ status: 'Auth Server Online' });
});
app.use('/api/auth', socialRoutes);
app.use('/api/auth', playerRoutes);

async function startServer() {
  // 连接 Redis (因为日志和社交功能需要)
  await connectRedis();

  app.listen(PORT, () => {
    console.log(`🛡️  Auth Server running on http://localhost:${PORT}`);
  });
}

startServer();