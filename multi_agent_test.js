/**
 * Multi Agent Test - Node.js Version
 * * Usage: node multi_agent_test.js
 * * 核心逻辑 (Update):
 * 1. 初始化：注册所有机器人。
 * 2. 社交构建：所有机器人两两互相关注 (模拟互粉)。
 * 3. 游戏循环：
 * - 优先维护自家农场。
 * - 获取/刷新好友列表。
 * - 仅对好友列表中的玩家进行 偷菜 (40%) 或 助人 (60%)。
 */

// ================= 配置区域 =================
const API_BASE = "http://localhost:3001/api";
const AUTH_BASE = "http://localhost:3002/api/auth";

const PLAYERS_COUNT = 100; // 机器人数量
const LOOP_COUNT = 500;    // 每个机器人行动的回合数

// 模拟的作物配置 (需与后端一致)
const CROPS_CONFIG = [
  { type: "radish", name: "白萝卜", levelReq: 0, seedPrice: 10, landReq: "normal" },
  { type: "carrot", name: "胡萝卜", levelReq: 1, seedPrice: 20, landReq: "normal" },
  { type: "corn", name: "玉米", levelReq: 3, seedPrice: 50, landReq: "normal" },
  { type: "potato", name: "土豆", levelReq: 5, seedPrice: 150, landReq: "normal" },
  { type: "strawberry", name: "草莓", levelReq: 10, seedPrice: 80, landReq: "red" },
  { type: "watermelon", name: "西瓜", levelReq: 20, seedPrice: 150, landReq: "red" }
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
    this.friends = []; // 存储好友列表
    this.gold = 0;
    this.level = 1;
    this.exp = 0;
  }

  log(message) {
    console.log(`[${this.name} Lv.${this.level}] ${message}`);
  }

  // [修改] 支持 baseUrl 参数，以便请求不同的服务 (Game vs Auth)
  async request(endpoint, method = "GET", body = null, baseUrl = API_BASE) {
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
      const res = await fetch(`${baseUrl}${endpoint}`, options);
      const isJson = res.headers.get("content-type")?.includes("application/json");
      if (!res.ok) {
        // const txt = await res.text();
        // console.error(`Req Failed: ${baseUrl}${endpoint} ${res.status}`, txt);
        return null;
      }
      return isJson ? await res.json() : null;
    } catch (e) {
      console.error(`Network Error (${endpoint}): ${e.message}`);
      return null;
    }
  }

  // --- Auth & Social ---

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
        this.log(`注册成功 ID:${this.playerId.slice(0, 6)}...`);
        return true;
      }
    } catch (e) {
      console.error("Reg error", e);
    }
    return false;
  }

  async follow(targetId) {
    // 调用 Auth Server
    return this.request('/follow', 'POST', { targetId }, AUTH_BASE);
  }

  async fetchFriends() {
    // 调用 Auth Server 获取好友 (不带分页即获取全量/默认量)
    // 接口返回结构可能是 Array 或 { data: [] }
    const res = await this.request('/friends', 'GET', null, AUTH_BASE);
    if (res) {
      // 兼容 FollowService 可能返回的两种格式
      const list = Array.isArray(res) ? res : (res.data || []);
      // 转换格式适配 playTurn 的使用习惯 (统一使用 playerId 字段)
      this.friends = list.map(f => ({
        playerId: f.id,
        name: f.name,
        level: f.level
      }));
      // this.log(`已更新好友列表: ${this.friends.length} 人`);
    }
  }

  async refreshState() {
    // 调用 Game Server
    const data = await this.request('/me', 'GET', null, API_BASE);
    if (data) {
      this.lands = data.lands || [];
      this.gold = data.gold;
      this.level = data.level || 1;
      this.exp = data.exp || 0;
    }
  }

  // ================= 核心行动逻辑 =================
  async playTurn() {
    if (!this.apiKey) return;

    // 1. 刷新状态
    await this.refreshState();

    // 2. 刷新好友 (模拟真实情况，不用每次都刷，但测试环境为了确保数据最新可以每次刷，或者按概率刷)
    // 为了不给 Auth Server 太大压力，可以加个判断，或者简单处理
    if (this.friends.length === 0) {
      await this.fetchFriends();
    }

    // 3. === 自家农场维护 ===
    // [收获]
    for (const land of this.lands) {
      if (land.status === "harvestable") {
        const res = await this.request('/harvest', 'POST', { position: land.position });
        if (res && res.success) {
          this.log(`自家收获 +${res.gold}G`); // 注意后端返回字段是 gold 而不是 reward.gold
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
          this.log(`种植了 ${cropToPlant.name}`);
        }
      }
    }

    // [自家照料]
    for (const land of this.lands) {
      if (land.status === 'planted' && (land.needsWater || land.hasWeeds || land.hasPests)) {
        let action = land.needsWater ? 'water' : (land.hasWeeds ? 'weed' : 'pest');
        await this.request('/care', 'POST', { position: land.position, type: action });
      }
    }

    // 4. === 社交互动 (仅限好友) ===
    if (this.friends && this.friends.length > 0) {
      const roll = Math.random();

      if (roll < 0.6) {
        // >>> 60% 概率：助人 <<<
        await this.doHelpRoutine(this.friends);
      } else {
        // >>> 40% 概率：偷菜 <<<
        await this.doStealRoutine(this.friends);
      }
    } else {
      // this.log("没有好友，无法进行社交互动");
    }
  }

  // --- 偷菜子程序 ---
  async doStealRoutine(targets) {
    // 随机找 2-3 个目标
    const count = Math.min(targets.length, 3);
    const victims = targets.sort(() => 0.5 - Math.random()).slice(0, count);

    for (const victim of victims) {
      // 每个人盲猜 2 个位置 (降低频率防止刷屏)
      const tryPositions = new Set();
      while (tryPositions.size < 2) tryPositions.add(randomInt(0, 11));

      for (const pos of tryPositions) {
        const res = await this.request('/steal', 'POST', { victimId: victim.playerId, position: pos }, API_BASE);
        if (res && res.success) {
          const s = res.stolen;
          this.log(`😈 偷了好友 [${victim.name}] 的 ${s.cropName} x${s.amount}`);
        } else if (res && res.reason === 'bitten') {
          this.log(`🐕 偷 [${victim.name}] 被狗咬! 罚款 ${res.penalty}G`);
        }
        await sleep(50);
      }
    }
  }

  // --- 助人子程序 ---
  async doHelpRoutine(targets) {
    const count = Math.min(targets.length, 2);
    const luckyTargets = targets.sort(() => 0.5 - Math.random()).slice(0, count);

    for (const target of luckyTargets) {
      const tryPositions = [randomInt(0, 5), randomInt(6, 11)];

      for (const pos of tryPositions) {
        // 1. 尝试铲除枯萎
        const resShovel = await this.request('/shovel', 'POST', { targetId: target.playerId, position: pos }, API_BASE);
        if (resShovel && resShovel.success) {
          this.log(`😇 帮好友 [${target.name}] 铲除了枯萎作物`);
          continue;
        }

        // 2. 尝试照料
        const action = randomChoice(['water', 'weed', 'pest']);
        const resCare = await this.request('/care', 'POST', { targetId: target.playerId, position: pos, type: action }, API_BASE);
        if (resCare && resCare.success) {
          this.log(`💧 帮好友 [${target.name}] ${action} 成功`);
        }
        await sleep(50);
      }
    }
  }
}

// ================= 主流程 =================

async function botWorker(agent) {
  // 错开启动
  await sleep(randomInt(0, 2000));

  // 初始拉取一次好友列表
  await agent.fetchFriends();
  agent.log(`初始好友加载完成: ${agent.friends.length} 人`);

  for (let i = 0; i < LOOP_COUNT; i++) {
    await agent.playTurn();
    // 随机间隔
    await sleep(randomInt(2000, 5000));
  }
}

async function main() {
  console.log(`=== 1. 初始化: 创建并注册 ${PLAYERS_COUNT} 个 Bot ===`);
  const bots = [];

  for (let i = 0; i < PLAYERS_COUNT; i++) {
    const bot = new FarmAgent(`Bot_${randomInt(1000, 9999)}`);
    if (await bot.register()) bots.push(bot);
    await sleep(20);
  }

  console.log(`\n=== 2. 构建社交网络 (全员互粉) ===`);
  // 让每个机器人关注其他所有机器人
  for (let i = 0; i < bots.length; i++) {
    const me = bots[i];
    const others = bots.filter(b => b.playerId !== me.playerId);

    // 简化日志
    process.stdout.write(`\r[${me.name}] 正在关注 ${others.length} 人...`);

    const followPromises = others.map(other => me.follow(other.playerId));
    await Promise.all(followPromises);
  }
  console.log(`\n✅ 社交网络构建完成！所有人都互相关注了。\n`);

  console.log(`=== 3. 开始游戏循环 (基于好友列表互动) ===`);

  const promises = bots.map(bot => botWorker(bot));
  await Promise.all(promises);

  console.log("=== 测试结束 ===");
}

main().catch(console.error);