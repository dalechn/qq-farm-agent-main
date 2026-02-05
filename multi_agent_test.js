/**
 * Multi Agent Test - Node.js Version (v3)
 * * Usage: node multi_agent_test.js
 * * 更新内容：
 * 1. 增加作物等级与金币限制
 * 2. 增加“帮助好友”环节 (除草/浇水/除虫/铲除枯萎)
 */

// ================= 配置区域 =================
const API_BASE = "http://localhost:3001/api"; 

const PLAYERS_COUNT = 100; // 机器人数量
const LOOP_COUNT = 50;    // 每个机器人行动的回合数 (测试回合)

// 模拟的作物配置 (需与后端数据库保持大致一致以确保逻辑正确)
const CROPS_CONFIG = [
  { type: "radish",     name: "白萝卜", levelReq: 0,  seedPrice: 125,  landReq: "normal" },
  { type: "carrot",     name: "胡萝卜", levelReq: 1,  seedPrice: 150,  landReq: "normal" },
  { type: "corn",       name: "玉米",   levelReq: 3,  seedPrice: 200,  landReq: "normal" },
  { type: "potato",     name: "土豆",   levelReq: 5,  seedPrice: 250,  landReq: "normal" },
  { type: "strawberry", name: "草莓",   levelReq: 10, seedPrice: 500,  landReq: "red" },    // 红土地作物
  { type: "watermelon", name: "西瓜",   levelReq: 20, seedPrice: 1000, landReq: "black" }   // 黑土地作物
];

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
    this.level = 1;
    this.exp = 0;
  }

  log(message) {
    console.log(`[${this.name} Lv.${this.level}] ${message}`);
  }

  async request(endpoint, method = "GET", body = null) {
    if (!this.apiKey && endpoint !== '/player') return null;
    
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "X-API-KEY": this.apiKey } : {})
      }
    };
    if (body) options.body = JSON.stringify(body);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, options);
      const isJson = res.headers.get("content-type")?.includes("application/json");
      
      if (!res.ok) {
        // 错误处理：如果是逻辑错误(400/403)通常忽略，系统错误则打印
        // const text = await res.text();
        // if (res.status >= 500) console.error(`[${this.name}] Server Error: ${text}`);
        return null;
      }
      return isJson ? await res.json() : null;
    } catch (e) {
      console.error(`[${this.name}] Network Error: ${e.message}`);
      return null;
    }
  }

  async register() {
    const data = await this.request('/player', 'POST', { name: this.name });
    if (data) {
      this.playerId = data.id;
      this.apiKey = data.apiKey;
      this.gold = data.gold;
      this.log(`注册成功 (ID: ${this.playerId.slice(0, 4)}..)`);
      return true;
    }
    return false;
  }

  async follow(targetId) {
    if (targetId === this.playerId) return;
    await this.request('/follow', 'POST', { targetId });
  }

  async refreshState() {
    const data = await this.request('/me');
    if (data) {
      this.lands = data.lands || [];
      this.gold = data.gold;
      this.level = data.level || 1;
      this.exp = data.exp || 0;
    }
  }

  async playTurn(friends) {
    if (!this.apiKey) return;

    // 每次行动前刷新状态
    await this.refreshState();

    // ================= 1. 自家农场维护 (Self Care) =================

    // [铲除枯萎]
    for (const land of this.lands) {
      if (land.status === 'withered') {
        const res = await this.request('/shovel', 'POST', { position: land.position });
        if (res && res.success) {
          this.log(`自家铲除 [位置${land.position}] +${res.exp}EXP`);
        }
      }
    }

    // [收获]
    for (const land of this.lands) {
      if (land.status === "harvestable") {
        const res = await this.request('/harvest', 'POST', { position: land.position });
        if (res && res.success) {
          let msg = `收获! +${res.reward?.gold || 0}G`;
          if (res.reward?.nextSeason) msg += " (下季生长中)";
          if (res.reward?.isWithered) msg += " (已枯萎)";
          this.log(msg);
        }
      }
    }

    // [照料自己]
    for (const land of this.lands) {
      if (land.status !== 'planted' && land.status !== 'harvestable') continue;
      
      let action = null;
      if (land.needsWater) action = 'water';
      else if (land.hasWeeds) action = 'weed';
      else if (land.hasPests) action = 'pest';

      if (action) {
        const res = await this.request('/care', 'POST', { position: land.position, type: action });
        if (res && res.success) {
          this.log(`自家照料: ${action} [位置${land.position}] +${res.exp}EXP`);
        }
      }
    }

    // ================= 2. 帮助好友 (Help Friends) =================
    // 逻辑：随机拜访几个好友，尝试进行有益操作
    if (friends && friends.length > 0) {
      // 随机选 2 个幸运好友
      const luckyFriends = friends.sort(() => 0.5 - Math.random()).slice(0, 2);

      for (const friend of luckyFriends) {
        // 由于没有 /visit 接口获取好友土地详情，我们采用“随机盲试”策略
        // 随机选 1-2 块地尝试操作
        const tryPositions = [randomInt(0, 5), randomInt(6, 11)]; 
        
        for (const pos of tryPositions) {
            // 随机尝试一种好事：浇水、除草、除虫、铲地
            const actionType = randomChoice(['water', 'weed', 'pest', 'shovel']);

            if (actionType === 'shovel') {
                // 尝试帮好友铲地
                const res = await this.request('/shovel', 'POST', { 
                    targetId: friend.playerId, 
                    position: pos 
                });
                if (res && res.success) {
                    this.log(`😇 帮好友 [${friend.name}] 铲除了枯萎作物 +${res.exp}EXP`);
                }
            } else {
                // 尝试帮好友照料
                const res = await this.request('/care', 'POST', { 
                    targetId: friend.playerId, 
                    position: pos, 
                    type: actionType 
                });
                if (res && res.success) {
                    this.log(`😇 帮好友 [${friend.name}] ${actionType} +${res.exp}EXP`);
                }
            }
            // 无论成功失败，稍微停顿防刷屏
            await sleep(50);
        }
      }
    }

    // ================= 3. 种植 (Plant with Restrictions) =================
    
    // 过滤出空地
    // 注意：由于上面可能刚铲除，this.lands 数据可能旧了，但在真实脚本中应该再次 refresh 或乐观更新
    // 这里简单起见，我们假设如果上面铲除了，下一回合再种
    const emptyLands = this.lands.filter(l => l.status === "empty");

    if (emptyLands.length > 0) {
      // 1. 筛选当前等级能种的作物
      const availableCrops = CROPS_CONFIG.filter(c => 
          c.levelReq <= this.level && 
          c.seedPrice <= this.gold
          // 可以在这里加 landReq 判断，假设 landType 都在 lands 数据里
      );

      if (availableCrops.length > 0) {
        // 随机选一块空地
        const targetLand = randomChoice(emptyLands);
        // 随机选一种买得起的作物（稍微偏向买贵的，升级快）
        const cropToPlant = availableCrops[availableCrops.length - 1]; // 简单策略：选列表里最后一个（通常是等级最高的）

        const res = await this.request('/plant', 'POST', { position: targetLand.position, cropType: cropToPlant.type });
        if (res && res.success) {
          this.gold -= cropToPlant.seedPrice; // 本地扣费防止连续请求透支
          // this.log(`种植 ${cropToPlant.name} (-${cropToPlant.seedPrice}G)`);
        }
      } else {
          // 没钱了或没解锁
          if (this.gold < 100) {
             // this.log("穷得买不起种子了...");
          }
      }
    }

    // ================= 4. 偷菜 (Steal) =================
    if (friends && friends.length > 0 && Math.random() < 0.2) {
      const victim = randomChoice(friends);
      const stealPos = randomInt(0, 11); // 随机位置盲偷

      const res = await this.request('/steal', 'POST', { victimId: victim.playerId, position: stealPos });
      if (res && res.success) {
        const stolen = res.stolen || {};
        this.log(`😈 偷到了! [${victim.name}] 的 ${stolen.cropName || '菜'} x${stolen.amount}`);
      }
    }
  }
}

// ================= 核心逻辑 =================

async function botWorker(agent, allBots) {
  // 过滤出好友（自己除外）
  const myFriends = allBots.filter(b => b.playerId !== agent.playerId);
  
  // 错开启动时间，避免并发拥堵
  await sleep(randomInt(0, 3000));

  for (let i = 0; i < LOOP_COUNT; i++) {
    await agent.playTurn(myFriends);
    // 随机休眠 3-6 秒，模拟人类操作频率
    await sleep(randomInt(3000, 6000));
  }
}

async function main() {
  console.log(`=== 1. 初始化: 创建 ${PLAYERS_COUNT} 个 Bot ===`);
  const bots = [];

  for (let i = 0; i < PLAYERS_COUNT; i++) {
    const name = `Agent_${randomInt(1000, 9999)}`;
    const bot = new FarmAgent(name);
    
    if (await bot.register()) {
      bots.push(bot);
    }
    await sleep(50);
  }

  console.log(`=== 2. 建立关系: 全员互粉 (确保可以互助) ===`);
  // 为了让“帮助好友”逻辑生效，必须互相关注
  for (let i = 0; i < bots.length; i++) {
    for (let j = 0; j < bots.length; j++) {
      if (i !== j) {
        await bots[i].follow(bots[j].playerId);
      }
    }
    if (i % 2 === 0) process.stdout.write("."); // 进度条效果
  }
  console.log("\n关系建立完成！");

  console.log(`=== 3. 开始大乱斗: 模拟真实游玩 ===`);
  console.log(`包含操作: 种植(限级)、收获、自家照料、[新]帮好友照料/铲地、偷菜`);
  
  const promises = bots.map(bot => botWorker(bot, bots));
  await Promise.all(promises);

  console.log("=== 测试结束 ===");
}

main().catch(console.error);