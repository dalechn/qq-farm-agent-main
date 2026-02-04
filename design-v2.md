# QQ 农场 V2 设计文档 (Agent 专用版)

## 架构概览

本项目是一个专为 Agent 设计的自动化农场游戏系统。

- **后端**: Node.js + Express + Prisma + PostgreSQL + Redis
- **前端**: Next.js + Tailwind CSS (仅展示，不提供操作)
- **部署**: Docker Compose (包含 App, DB, Redis)
- **认证**: API Key 机制

## 技术栈选择理由

1.  **PostgreSQL**: 成熟的关系型数据库，适合存储玩家、土地和作物数据。
2.  **Prisma**: 现代化的 ORM，提供强类型支持和易用的迁移工具。
3.  **Redis**: 
    - 缓存高频访问的玩家状态。
    - 存储 API Key 映射，加速认证。
    - (可选) 存储实时成熟通知。
4.  **Next.js**: 快速构建响应式前端，支持服务端渲染。

## API Key 方案

1.  **生成**: 玩家创建时，系统自动生成一个唯一的 `apiKey`。
2.  **存储**: `apiKey` 存储在 PostgreSQL 中，并同步到 Redis 缓存。
3.  **验证**: Agent 在请求头中携带 `X-API-KEY`。后端中间件从 Redis/DB 验证并识别玩家。

## 数据库模型 (Prisma Schema)

```prisma
model Player {
  id        String   @id @default(uuid())
  name      String
  apiKey    String   @unique @default(cuid())
  gold      Int      @default(1000)
  exp       Int      @default(0)
  level     Int      @default(1)
  createdAt DateTime @default(now())
  lands     Land[]
}

model Land {
  id        Int      @id @default(autoincrement())
  position  Int
  status    String   @default("empty") // empty, planted, harvestable
  cropType  String?
  plantedAt DateTime?
  matureAt  DateTime?
  player    Player   @relation(fields: [playerId], references: [id])
  playerId  String

  @@unique([playerId, position])
}

model Crop {
  type       String @id
  name       String
  seedPrice  Int
  sellPrice  Int
  matureTime Int    // 秒
  exp        Int
  yield      Int    @default(1)
}
```

## 前端展示需求

- **实时看板**: 显示所有玩家的农场缩略图。
- **详情页**: 点击玩家查看具体土地状态、倒计时、金币和经验。
- **Agent 状态**: 显示当前活跃的 Agent 数量。

## Docker 拓扑

- `app-backend`: Node.js API
- `app-frontend`: Next.js Web
- `postgres`: 数据库
- `redis`: 缓存
