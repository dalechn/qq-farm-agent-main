/**
 * Multi Agent Test - Node.js Version (Updated for Game Mechanics v2)
 * * Usage: node multi_agent_test.js
 */

// ================= 配置区域 =================
const API_BASE = "http://localhost:3001/api"; 

const PLAYERS_COUNT = 10; // 机器人数量
const LOOP_COUNT = 100;   // 每个机器人行动的回合数

// 更新为包含新数据库中定义的作物
const CROP_TYPES = [
  "radish", "carrot", "corn", 
  "potato", "strawberry", "tomato", 
  "watermelon", "pumpkin"
];
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
      if (!res.ok) {
        // const text = await res.text();
        // console.error(`[${this.name}] API Error ${endpoint}: ${res.status} ${text}`);
        return null;
      }
      return await res.json();
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
    }
  }

  async playTurn(friends) {
    if (!this.apiKey) return;

    await this.refreshState();

    // --- 1. 铲除枯萎 (Shovel) ---
    // 优先级最高，否则占着茅坑不拉屎
    for (const land of this.lands) {
      if (land.status === 'withered') {
        const res = await this.request('/shovel', 'POST', { position: land.position });
        if (res && res.success) {
          this.log(`铲除枯萎作物 [位置${land.position}] +${res.exp}EXP`);
        }
      }
    }

    // --- 2. 收获 (Harvest) ---
    for (const land of this.lands) {
      if (land.status === "harvestable") {
        const res = await this.request('/harvest', 'POST', { position: land.position });
        if (res && res.success) {
          let msg = `收获! +${res.reward?.gold || 0}G`;
          if (res.reward?.nextSeason) msg += " (进入下一季)";
          if (res.reward?.isWithered) msg += " (已枯萎)";
          this.log(msg);
        }
      }
    }

    // --- 3. 照料 (Care) ---
    // 检查是否有灾害
    for (const land of this.lands) {
      // 只有种植状态才需要照料
      if (land.status !== 'planted' && land.status !== 'harvestable') continue;

      let action = null;
      let actionName = "";
      
      if (land.needsWater) { action = 'water'; actionName = "浇水"; }
      else if (land.hasWeeds) { action = 'weed'; actionName = "除草"; }
      else if (land.hasPests) { action = 'pest'; actionName = "除虫"; }

      if (action) {
        const res = await this.request('/care', 'POST', { position: land.position, type: action });
        if (res && res.success) {
          this.log(`进行照料: ${actionName} [位置${land.position}] +${res.exp}EXP`);
        }
      }
    }

    // --- 4. 种植 (Plant) ---
    // 需要刷新一下状态，因为刚才可能铲除了
    // 为了节省请求，这里直接用本地状态判断，如果刚才铲除了，下一轮循环再种也行
    // 但为了激进点，我们简单过滤一下
    const emptyLands = this.lands.filter(l => l.status === "empty"); // 注意：这里还是旧状态，实际可能已经变了
    
    // 如果有钱且有空地
    if (emptyLands.length > 0 && this.gold >= 100) { 
      // 随机选一块地
      const targetLand = randomChoice(emptyLands);
      // 随机选一种作物
      const crop = randomChoice(CROP_TYPES);

      // 简单的去重锁，防止同回合对同一块地重复操作（虽然服务器会拦）
      const res = await this.request('/plant', 'POST', { position: targetLand.position, cropType: crop });
      if (res && res.success) {
        this.gold -= 50; // 假扣费
        // this.log(`种植 ${crop} [位置${targetLand.position}]`);
      }
    }

    // --- 5. 偷菜 (Steal) ---
    // 30% 的概率尝试偷菜，避免请求过于频繁被封IP（如果有风控的话）
    if (friends && friends.length > 0 && Math.random() < 0.3) {
      const victim = randomChoice(friends);
      const stealPos = randomInt(0, 8); // 随机位置盲偷

      const res = await this.request('/steal', 'POST', { victimId: victim.playerId, position: stealPos });
      if (res && res.success) {
        const stolen = res.stolen || {};
        this.log(`😈 偷到了! [${victim.name}] 的 ${stolen.cropName} x${stolen.amount}`);
      }
    }
  }
}

// ================= 核心逻辑 =================

async function botWorker(agent, allBots) {
  // 过滤出好友（自己除外）
  const myFriends = allBots.filter(b => b.playerId !== agent.playerId);
  
  // 错开启动时间
  await sleep(randomInt(0, 3000));

  for (let i = 0; i < LOOP_COUNT; i++) {
    await agent.playTurn(myFriends);
    // 随机休眠 2-5 秒，模拟人类操作频率
    await sleep(randomInt(2000, 5000));
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
    await sleep(100);
  }

  console.log(`=== 2. 建立关系: 全员互粉 ===`);
  for (let i = 0; i < bots.length; i++) {
    for (let j = 0; j < bots.length; j++) {
      if (i !== j) {
        await bots[i].follow(bots[j].playerId);
      }
    }
    if (i % 5 === 0) await sleep(200);
  }

  console.log(`=== 3. 开始大乱斗: 模拟真实游玩 ===`);
  console.log(`包含操作: 种植、收获、浇水/除草/除虫、铲除枯萎、偷菜`);
  
  const promises = bots.map(bot => botWorker(bot, bots));
  await Promise.all(promises);

  console.log("=== 测试结束 ===");
}

main().catch(console.error);