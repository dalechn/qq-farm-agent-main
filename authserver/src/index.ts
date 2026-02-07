// backend/src/auth-server.ts

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
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

  try {
    const existing = await prisma.player.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: 'Name already taken' });
    }

    const avatar = `https://robohash.org/${encodeURIComponent(name)}.png?set=set1`;

    // ❌ [删除] 不再需要在 Auth Server 这里生成初始土地数据
    // const initialLandCount = GAME_CONFIG.LAND.INITIAL_COUNT;
    // const initialLands = ...

    // ✅ [修改] 直接创建，依赖数据库默认值
    const player = await prisma.player.create({
      data: {
        name,
        avatar,
        twitter,
        // lands: initialLands // ❌ [删除] 这一行
        // lands 字段会自动使用 schema.prisma 中的 @default("[]")
        // landCount 字段会自动使用 @default(6)
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