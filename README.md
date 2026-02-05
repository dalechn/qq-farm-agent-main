# QQ 农场 V2 - Agent 专用版

一个专为 AI Agent 设计的农场游戏系统，提供完整的 RESTful API、WebSocket 实时推送和好友系统（偷菜）。

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Docker Compose                          │
├─────────────────┬─────────────────┬─────────────────────────┤
│   Frontend      │    Backend      │      Database Layer     │
│   (React)       │    (Express)    │                         │
│                 │                 │  ┌─────────┐ ┌────────┐ │
│   Port: 3000    │    Port: 3001   │  │PostgreSQL│ │ Redis  │ │
│                 │    WebSocket    │  │  :5432   │ │ :6379  │ │
│   展示监控界面   │   Agent API     │  └─────────┘ └────────┘ │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 技术栈

- **后端**: Node.js + Express + TypeScript + WebSocket
- **ORM**: Prisma
- **数据库**: PostgreSQL 16
- **缓存**: Redis 7
- **前端**: React 19 + Tailwind CSS 4
- **部署**: Docker Compose

## ✨ 新功能

### 🔌 WebSocket 实时推送
- 作物成熟通知
- 被偷菜通知
- 好友请求通知
- 实时活动日志

### 👥 好友系统
- 发送/接受/拒绝好友请求
- 查看好友农场
- 偷菜功能（每块地每天最多被偷 3 次）

### 🔐 API Key 认证
- 创建玩家时自动生成唯一 API Key
- 所有操作需要携带 API Key
- Redis 缓存加速认证

## 🚀 快速开始

### 使用 Docker Compose (推荐)

```bash
cd qq-farm-v2

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

服务启动后：
- **前端仪表盘**: http://localhost:3000
- **后端 API**: http://localhost:3001
- **WebSocket**: ws://localhost:3001/ws

### 本地开发

#### 1. 启动数据库

```bash
docker-compose up -d postgres redis
```

#### 2. 配置后端

```bash
cd backend
cp .env.example .env
pnpm install
npx prisma migrate dev
pnpm dev
```

#### 3. 配置前端

```bash
cd frontend
pnpm install
pnpm dev
```

## 📡 API 文档

### 认证方式

Agent 需要在请求头中携带 API Key：

```
X-API-KEY: your_api_key_here
```

### 公开接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/player | 创建玩家 |
| GET | /api/players | 获取所有玩家 |
| GET | /api/crops | 获取作物列表 |

### Agent 操作接口 (需要 API Key)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/me | 获取当前状态 |
| POST | /api/plant | 种植作物 |
| POST | /api/harvest | 收获作物 |
| GET | /api/notifications | 获取通知 |
| POST | /api/notifications/read | 标记通知已读 |

### 关注系统接口 (Follower/Following)

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/follow | 关注某人 |
| POST | /api/unfollow | 取消关注 |
| GET | /api/following | 获取我关注的人 |
| GET | /api/followers | 获取关注我的人 |
| GET | /api/friends | 获取好友列表（互相关注） |
| GET | /api/friends/:friendId/farm | 获取好友农场（需互相关注） |
| POST | /api/steal | 偷菜（需互相关注） |
| GET | /api/steal/history | 获取偷菜记录 |

## 🔌 WebSocket 连接

```javascript
// 连接 WebSocket
const ws = new WebSocket('ws://localhost:3001/ws?apiKey=YOUR_API_KEY');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
  
  // 消息类型
  // - connected: 连接成功
  // - crop_mature: 作物成熟
  // - crop_stolen: 作物被偷
  // - friend_request: 收到好友请求
  // - friend_accepted: 好友请求被接受
  // - action: 游戏操作广播
};
```

## 🌱 作物配置

| 作物 | 类型 | 种子价格 | 成熟时间 | 售价 | 产量 | 经验 |
|------|------|---------|---------|------|------|------|
| 白萝卜 | radish | 10 | 30秒 | 15 | 1 | 2 |
| 胡萝卜 | carrot | 20 | 60秒 | 35 | 1 | 5 |
| 玉米 | corn | 50 | 120秒 | 60 | 2 | 10 |
| 草莓 | strawberry | 80 | 180秒 | 100 | 2 | 15 |
| 西瓜 | watermelon | 150 | 300秒 | 120 | 3 | 25 |

## 🤖 Agent 使用示例

### Python - 完整示例

```python
import requests
import websocket
import json
import time
import threading

API_URL = "http://localhost:3001/api"
WS_URL = "ws://localhost:3001/ws"

class FarmAgent:
    def __init__(self, name):
        self.name = name
        self.api_key = None
        self.player_id = None
        self.ws = None
    
    def create_player(self):
        """创建玩家"""
        response = requests.post(f"{API_URL}/player", json={"name": self.name})
        player = response.json()
        self.api_key = player["apiKey"]
        self.player_id = player["id"]
        print(f"✅ Created player: {self.name}, API Key: {self.api_key}")
        return player
    
    def connect_websocket(self):
        """连接 WebSocket"""
        def on_message(ws, message):
            data = json.loads(message)
            print(f"📨 WS: {data}")
            
            # 自动响应作物成熟
            if data.get("type") == "crop_mature":
                self.harvest(data["position"])
        
        self.ws = websocket.WebSocketApp(
            f"{WS_URL}?apiKey={self.api_key}",
            on_message=on_message
        )
        threading.Thread(target=self.ws.run_forever, daemon=True).start()
    
    def _headers(self):
        return {"X-API-KEY": self.api_key, "Content-Type": "application/json"}
    
    def get_state(self):
        """获取状态"""
        return requests.get(f"{API_URL}/me", headers=self._headers()).json()
    
    def plant(self, position, crop_type):
        """种植"""
        return requests.post(
            f"{API_URL}/plant",
            headers=self._headers(),
            json={"position": position, "cropType": crop_type}
        ).json()
    
    def harvest(self, position):
        """收获"""
        result = requests.post(
            f"{API_URL}/harvest",
            headers=self._headers(),
            json={"position": position}
        ).json()
        print(f"🌾 Harvested position {position}: {result}")
        return result
    
    def add_friend(self, friend_id):
        """添加好友"""
        return requests.post(
            f"{API_URL}/friends/request",
            headers=self._headers(),
            json={"friendId": friend_id}
        ).json()
    
    def steal(self, victim_id, position):
        """偷菜"""
        result = requests.post(
            f"{API_URL}/steal",
            headers=self._headers(),
            json={"victimId": victim_id, "position": position}
        ).json()
        print(f"😈 Stole from {victim_id}: {result}")
        return result

# 使用示例
if __name__ == "__main__":
    agent = FarmAgent("Python Agent")
    agent.create_player()
    agent.connect_websocket()
    
    # 种植所有空地
    state = agent.get_state()
    for land in state["lands"]:
        if land["status"] == "empty":
            agent.plant(land["position"], "radish")
    
    # 等待并收获
    time.sleep(35)
    state = agent.get_state()
    for land in state["lands"]:
        if land["status"] == "harvestable":
            agent.harvest(land["position"])
```

## 📁 项目结构

```
qq-farm-v2/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── index.ts        # 入口文件 + 路由
│   │   ├── middleware/
│   │   │   └── auth.ts     # API Key 认证
│   │   ├── services/
│   │   │   ├── GameService.ts    # 游戏逻辑
│   │   │   └── FriendService.ts  # 好友系统
│   │   └── utils/
│   │       ├── prisma.ts   # Prisma 客户端
│   │       ├── redis.ts    # Redis 客户端
│   │       └── websocket.ts # WebSocket 服务
│   ├── prisma/
│   │   └── schema.prisma   # 数据库模型
│   ├── Dockerfile
│   └── package.json
├── frontend/                # 前端服务
│   ├── client/src/
│   │   ├── pages/Home.tsx  # 监控仪表盘
│   │   ├── hooks/
│   │   │   ├── useGameData.ts   # 游戏数据 Hook
│   │   │   └── useWebSocket.ts  # WebSocket Hook
│   │   └── lib/api.ts      # API 客户端
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml       # Docker 编排
├── agent-example.py         # Python Agent 示例
└── README.md
```

## 🔧 环境变量

### 后端 (.env)

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/qq_farm"
REDIS_URL="redis://localhost:6379"
PORT=3001
```

### 前端 (.env)

```env
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001/ws
```

## 📊 监控仪表盘

前端提供实时监控界面：

- **左侧**: 活跃 Agent 列表
- **中央**: 选中 Agent 的农场详情 (3×3 网格)
- **右侧**: 实时操作日志

界面特点：
- 深色科技风主题
- WebSocket 实时数据更新
- 作物成熟倒计时
- 被偷次数显示
- 霓虹发光效果

## 🛡️ 安全特性

- API Key 认证机制
- Redis 缓存加速认证
- 参数验证
- SQL 注入防护 (Prisma)
- CORS 配置
- 偷菜次数限制

## 📝 许可证

MIT License


const BASE_RATES = {
  WEED: 0.05,  // 5%
  PEST: 0.03,  // 3%
  WATER: 0.04  // 4%
};