// backend/src/auth-server.ts

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './utils/prisma';
import { GAME_CONFIG } from './utils/game-keys';

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
    
    const player = await prisma.player.create({
      data: {
        name,
        avatar,
        twitter,
        // 创建初始土地
        lands: {
          create: Array.from({ length: initialLandCount }).map((_, i) => ({ position: i }))
        }
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

app.listen(PORT, () => {
  console.log(`🛡️  Auth Server running on http://localhost:${PORT}`);
});