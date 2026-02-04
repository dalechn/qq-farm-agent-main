/**
 * Multi Agent Test - Node.js Version
 * 
 * Usage: node multi_agent_test.js
 */

// ================= 配置区域 =================
const API_BASE = "http://localhost:3001/api"; // 本地环境
// const API_BASE = "https://frenmap.fun/api"; // 线上环境

const PLAYERS_COUNT = 10; // 机器人数量
const LOOP_COUNT = 100;   // 每个机器人行动的回合数
const CROP_TYPES = ["radish", "carrot", "corn"];
// ===========================================

// ================= 工具函数 =================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
// ===========================================

class FarmAgent {
  constructor(name) {
    this.name = name;
    this.apiKey = null;
    this.playerId = null;
    this.lands = [];
    this.gold = 0;
  }

  log(message) {
    console.log(`[${this.name}] ${message}`);
  }

  async register() {
    try {
      const res = await fetch(`${API_BASE}/player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: this.name })
      });

      if (res.ok) {
        const data = await res.json();
        this.playerId = data.id;
        this.apiKey = data.apiKey;
        this.gold = data.gold;
        this.log(`注册成功 (ID: ${this.playerId.slice(0, 4)}..)`);
        return true;
      } else {
        const text = await res.text();
        this.log(`注册失败 [Status: ${res.status}]: ${text}`);
        return false;
      }
    } catch (e) {
      this.log(`连接错误: ${e.message}`);
      return false;
    }
  }

  async follow(targetId) {
    if (!this.apiKey || targetId === this.playerId) return;
    try {
      const res = await fetch(`${API_BASE}/follow`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": this.apiKey
        },
        body: JSON.stringify({ targetId })
      });
      
      // 成功时不打印日志减少刷屏，保留错误或关注关系结果
      // if (res.ok) console.log(`${this.name} followed ${targetId}`);
    } catch (e) {
      this.log(`关注失败: ${e.message}`);
    }
  }

  async refreshState() {
    if (!this.apiKey) return;
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { "X-API-KEY": this.apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        this.lands = data.lands || [];
        this.gold = data.gold;
      }
    } catch (e) {
      // 静默失败
    }
  }

  async playTurn(friends) {
    if (!this.apiKey) return;

    await this.refreshState();

    // --- 1. 收获 ---
    for (const land of this.lands) {
      if (land.status === "harvestable") {
        try {
          const res = await fetch(`${API_BASE}/harvest`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-KEY": this.apiKey
            },
            body: JSON.stringify({ position: land.position })
          });
          
          if (res.ok) {
            const data = await res.json();
            this.log(`收获! +${data.reward?.gold || 0}G`);
          }
        } catch (e) {
          console.error("Harvest error", e);
        }
      }
    }

    // --- 2. 种植 ---
    const emptyLands = this.lands.filter(l => l.status === "empty");
    if (emptyLands.length > 0 && this.gold >= 20) {
      const targetLand = randomChoice(emptyLands);
      const crop = randomChoice(CROP_TYPES);

      try {
        const res = await fetch(`${API_BASE}/plant`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": this.apiKey
          },
          body: JSON.stringify({ position: targetLand.position, cropType: crop })
        });
        
        if (res.ok) {
          this.gold -= 10; // 本地乐观扣费
        }
      } catch (e) {
        console.error("Plant error", e);
      }
    }

    // --- 3. 偷菜 ---
    if (friends && friends.length > 0) {
      const victim = randomChoice(friends);
      const stealPos = randomInt(0, 8);

      try {
        const res = await fetch(`${API_BASE}/steal`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": this.apiKey
          },
          body: JSON.stringify({ victimId: victim.playerId, position: stealPos })
        });

        if (res.ok) {
          const data = await res.json();
          const stolen = data.stolen || {};
          this.log(`😈 成功从 [${victim.name}] 偷到了 ${stolen.amount} 个 ${stolen.cropName}!`);
        } else if (res.status === 400 || res.status === 500) {
           // 忽略常见的业务逻辑错误 (Nothing to steal, Already stolen, Too busy)
           // 但可以打印调试信息
        }
      } catch (e) {
        console.error("Steal error", e);
      }
    }
  }
}

// ================= 核心逻辑 =================

async function botWorker(agent, allBots) {
  // 过滤出好友（自己除外）
  const myFriends = allBots.filter(b => b.playerId !== agent.playerId);
  
  // 错开启动时间 (0-2秒)
  await sleep(randomInt(0, 2000));

  for (let i = 0; i < LOOP_COUNT; i++) {
    await agent.playTurn(myFriends);
    // 随机休眠 1-3 秒
    await sleep(randomInt(1000, 3000));
  }
}

async function main() {
  console.log(`=== 1. 初始化: 创建 ${PLAYERS_COUNT} 个 Bot ===`);
  const bots = [];

  for (let i = 0; i < PLAYERS_COUNT; i++) {
    // 使用时间戳+随机数防止重名
    const name = `Agent_${Date.now()}_${randomInt(100, 999)}`;
    const bot = new FarmAgent(name);
    
    if (bot.register()) {
      bots.push(bot);
    }
    
    // 避免请求过快，稍微延时
    await sleep(200);
  }

  console.log(`=== 2. 建立关系: 全员互粉 ===`);
  
  // 简单的两两互相关注逻辑
  for (let i = 0; i < bots.length; i++) {
    for (let j = 0; j < bots.length; j++) {
      if (i !== j) {
        await bots[i].follow(bots[j].playerId);
      }
    }
    // 延时一下防止雪崩
    if ((i + 1) % 5 === 0) {
      console.log(`   已完成 ${i + 1} 个 Bot 的关注操作...`);
      await sleep(500);
    }
  }

  console.log(`=== 3. 开始大乱斗: 多线程运行 ===`);
  
  // 使用 Promise.all 开跑所有 Worker
  // 注意：对于非常大的并发量，这里应该用 Promise.allSettled 或限制并发池
  // 但 10 个 Bot 直接并行跑是完全没问题的
  const promises = bots.map(bot => botWorker(bot, bots));
  
  await Promise.all(promises);

  console.log("=== 测试结束 ===");
}

// 运行
main().catch(console.error);

