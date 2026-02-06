/**
 * Multi Agent Test - Node.js Version (v5 - Balanced Life)
 * * Usage: node multi_agent_test.js
 * * 核心逻辑更新：
 * 1. 必须优先完成自家农场的维护 (Harvest/Plant/Self-Care)。
 * 2. 社交互动 (Social Interaction) 采用概率分支：
 * - 40% 概率：变身“偷菜恶霸”，疯狂寻找成熟作物。
 * - 60% 概率：变身“热心邻居”，帮好友除草/浇水/铲除枯萎。
 */

// ================= 配置区域 =================
const API_BASE = "http://localhost:3001/api";
const AUTH_BASE = "http://localhost:3002/api/auth";

const PLAYERS_COUNT = 100; // 机器人数量
const LOOP_COUNT = 50;    // 每个机器人行动的回合数

// 模拟的作物配置 (需与后端一致)
const CROPS_CONFIG = [
  { type: "radish",     name: "白萝卜", levelReq: 0,  seedPrice: 10,   landReq: "normal" }, // 价格微调对齐game-keys
  { type: "carrot",     name: "胡萝卜", levelReq: 1,  seedPrice: 20,   landReq: "normal" },
  { type: "corn",       name: "玉米",   levelReq: 3,  seedPrice: 50,   landReq: "normal" },
  { type: "potato",     name: "土豆",   levelReq: 5,  seedPrice: 150,  landReq: "normal" },
  { type: "strawberry", name: "草莓",   levelReq: 10, seedPrice: 80,   landReq: "red" },
  { type: "watermelon", name: "西瓜",   levelReq: 20, seedPrice: 150,  landReq: "red" }
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
      if (!res.ok) return null;
      return isJson ? await res.json() : null;
    } catch (e) {
      // console.error(`Network Error: ${e.message}`);
      return null;
    }
  }

  async register() {
    try {
      const res = await fetch(`${AUTH_BASE}/player`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: this.name })
      });
      if (res.ok) {
        const data = await res.json();
        this.playerId = data.id;
        this.apiKey = data.apiKey;
        this.gold = data.gold;
        this.log(`注册成功`);
        return true;
      }
    } catch (e) {}
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

  // ================= 核心行动逻辑 =================
  async playTurn(friends) {
    if (!this.apiKey) return;

    // 1. 必须先刷新状态
    await this.refreshState();

    // 2. === 必须先做：自家农场维护 (Self Maintenance) ===
    // 逻辑：如果不先收菜，被别人偷了就亏了；如果不先种菜，别人没得偷。
    
    // [收获]
    for (const land of this.lands) {
      if (land.status === "harvestable") {
        const res = await this.request('/harvest', 'POST', { position: land.position });
        if (res && res.success) {
          this.log(`自家收获 +${res.reward?.gold}G`);
        }
      }
    }

    // [铲除自家枯萎]
    for (const land of this.lands) {
      if (land.status === 'withered') {
        await this.request('/shovel', 'POST', { position: land.position });
      }
    }

    // [种植]
    const emptyLands = this.lands.filter(l => l.status === "empty");
    if (emptyLands.length > 0) {
      const availableCrops = CROPS_CONFIG.filter(c => c.levelReq <= this.level && c.seedPrice <= this.gold);
      if (availableCrops.length > 0) {
        const targetLand = randomChoice(emptyLands);
        const cropToPlant = randomChoice(availableCrops); 
        const res = await this.request('/plant', 'POST', { position: targetLand.position, cropType: cropToPlant.type });
        if (res && res.success) {
          this.gold -= cropToPlant.seedPrice;
        }
      }
    }

    // [自家照料] (优先级略低，放后面也没事)
    for (const land of this.lands) {
      if (land.status === 'planted' && (land.needsWater || land.hasWeeds || land.hasPests)) {
        let action = land.needsWater ? 'water' : (land.hasWeeds ? 'weed' : 'pest');
        await this.request('/care', 'POST', { position: land.position, type: action });
      }
    }

    // 3. === 社交互动 (Social) ===
    // 60% 做好事，40% 偷菜
    if (friends && friends.length > 0) {
      const roll = Math.random(); // 0.0 ~ 1.0

      if (roll < 0.6) {
        // >>> 40% 概率：偷菜模式 (Steal Mode) <<<
        await this.doStealRoutine(friends);
      } else {
        // >>> 60% 概率：好人模式 (Helper Mode) <<<
        await this.doHelpRoutine(friends);
      }
    }
  }

  // --- 偷菜子程序 ---
  async doStealRoutine(friends) {
    // 随机找 3-5 个“倒霉蛋”
    const count = Math.min(friends.length, 5);
    const victims = friends.sort(() => 0.5 - Math.random()).slice(0, count);
    
    for (const victim of victims) {
      // 每个人盲猜 3 个位置
      const tryPositions = new Set();
      while(tryPositions.size < 3) tryPositions.add(randomInt(0, 11));

      for (const pos of tryPositions) {
        const res = await this.request('/steal', 'POST', { victimId: victim.playerId, position: pos });
        if (res && res.success) {
          const s = res.stolen;
          this.log(`😈 偷窃成功! [${victim.name}] 的 ${s.cropName} x${s.amount}`);
        } else if (res && res.code === 'DOG_BITTEN') {
          this.log(`🐕 被狗咬! 罚款 ${res.penalty}G`);
        }
        await sleep(20);
      }
    }
  }

  // --- 助人子程序 ---
  async doHelpRoutine(friends) {
    // 随机找 2-3 个好友送温暖
    const count = Math.min(friends.length, 3);
    const luckyFriends = friends.sort(() => 0.5 - Math.random()).slice(0, count);

    for (const friend of luckyFriends) {
      // 盲猜位置尝试帮忙
      const tryPositions = [randomInt(0, 5), randomInt(6, 11)];
      
      for (const pos of tryPositions) {
        // 1. 优先尝试铲除枯萎 (经验高)
        const resShovel = await this.request('/shovel', 'POST', { targetId: friend.playerId, position: pos });
        if (resShovel && resShovel.success) {
          this.log(`😇 帮好友 [${friend.name}] 铲除了枯萎作物`);
          continue; // 铲完了就不用照料了
        }

        // 2. 尝试随机照料 (浇水/除草/除虫)
        const action = randomChoice(['water', 'weed', 'pest']);
        const resCare = await this.request('/care', 'POST', { targetId: friend.playerId, position: pos, type: action });
        if (resCare && resCare.success) {
          this.log(`💧 帮好友 [${friend.name}] ${action} 成功`);
        }
        await sleep(20);
      }
    }
  }
}

// ================= 主流程 =================

async function botWorker(agent, allBots) {
  const myFriends = allBots.filter(b => b.playerId !== agent.playerId);
  
  // 错开启动
  await sleep(randomInt(0, 2000));

  for (let i = 0; i < LOOP_COUNT; i++) {
    await agent.playTurn(myFriends);
    // 随机间隔 2~4 秒
    await sleep(randomInt(2000, 4000));
  }
}

async function main() {
  console.log(`=== 1. 初始化: 创建 ${PLAYERS_COUNT} 个 Bot ===`);
  const bots = [];

  for (let i = 0; i < PLAYERS_COUNT; i++) {
    const bot = new FarmAgent(`Agent_${randomInt(1000, 9999)}`);
    if (await bot.register()) bots.push(bot);
    await sleep(10);
  }

  console.log(`=== 2. 建立关系: 全员互粉 ===`);
  for (let i = 0; i < bots.length; i++) {
    for (let j = 0; j < bots.length; j++) {
      if (i !== j) bots[i].follow(bots[j].playerId).catch(()=>{});
    }
    if (i % 20 === 0) process.stdout.write(".");
  }
  console.log("\n关系建立完成！");

  console.log(`=== 3. 开始大乱斗 (60% 好人 / 40% 恶霸) ===`);
  
  const promises = bots.map(bot => botWorker(bot, bots));
  await Promise.all(promises);

  console.log("=== 测试结束 ===");
}

main().catch(console.error);