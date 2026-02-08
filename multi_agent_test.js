/**
 * Multi Agent Test - Node.js Version (Robust)
 * * Usage: node multi_agent_test.js
 * * 核心逻辑 (Update):
 * 1. 初始化：使用唯一Hash生成名字，循环注册直到满员。
 * 2. 社交构建：全员互粉，确保构建完整的 P2P 社交图谱。
 * 3. 游戏循环：基于最新的好友列表进行偷菜/助人。
 */

const crypto = require('crypto'); // 引入 crypto 用于生成唯一ID

// ================= 配置区域 =================
const API_BASE = "http://localhost:3001/api";
const AUTH_BASE = "http://localhost:3002/api/auth";

const PLAYERS_COUNT = 100; // 目标机器人数量
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

// 生成唯一且易读的名字: Bot_序号_Hash前3位
const generateUniqueName = (index) => {
  const hash = crypto.randomBytes(3).toString('hex');
  return `Bot_${index}_${hash}`;
};

// ================= Agent 类 =================
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

  // 通用请求方法
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
        // 调试用：如果报错，可以尝试读取错误文本
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
      } else {
        const txt = await res.text();
        console.error(`[${this.name}] 注册失败: ${res.status} - ${txt}`);
      }
    } catch (e) {
      console.error(`[${this.name}] 注册异常:`, e);
    }
    return false;
  }

  async follow(targetId) {
    return this.request('/follow', 'POST', { targetId }, AUTH_BASE);
  }

  async fetchFriends() {
    const res = await this.request('/friends', 'GET', null, AUTH_BASE);
    if (res) {
      // 兼容可能返回 { data: [] } 或 []
      const list = Array.isArray(res) ? res : (res.data || []);
      this.friends = list.map(f => ({
        playerId: f.id,
        name: f.name,
        level: f.level
      }));
    }
  }

  async refreshState() {
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

    // 2. 刷新好友 (如果列表为空，强制刷新；否则低概率刷新)
    if (this.friends.length === 0 || Math.random() < 0.05) {
      await this.fetchFriends();
    }

    // 3. === 自家农场维护 ===
    // [收获]
    for (const land of this.lands) {
      if (land.status === "harvestable") {
        const res = await this.request('/harvest', 'POST', { position: land.position });
        if (res && res.success) {
          this.log(`自家收获 +${res.gold}G`);
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
    }
  }

  // --- 偷菜子程序 ---
  async doStealRoutine(targets) {
    const count = Math.min(targets.length, 3);
    const victims = targets.sort(() => 0.5 - Math.random()).slice(0, count);

    for (const victim of victims) {
      // 盲猜 2 个位置
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
        // 尝试铲除枯萎
        const resShovel = await this.request('/shovel', 'POST', { targetId: target.playerId, position: pos }, API_BASE);
        if (resShovel && resShovel.success) {
          this.log(`😇 帮好友 [${target.name}] 铲除了枯萎作物`);
          continue;
        }

        // 尝试照料
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

  for (let i = 0; i < LOOP_COUNT; i++) {
    await agent.playTurn();
    // 随机间隔 2-5秒
    await sleep(randomInt(2000, 5000));
  }
}

async function main() {
  console.log(`=== 1. 初始化: 尝试注册 ${PLAYERS_COUNT} 个 Bot ===`);
  const bots = [];

  let attempts = 0;
  // 循环直到注册够人数，或者尝试太多次
  while (bots.length < PLAYERS_COUNT && attempts < PLAYERS_COUNT * 2) {
    attempts++;
    // 使用唯一命名
    const botName = generateUniqueName(bots.length + 1);
    const bot = new FarmAgent(botName);

    // 注册，失败则会打印日志
    if (await bot.register()) {
      bots.push(bot);
    }

    // 短暂间隔防止请求过快
    await sleep(100);
  }

  if (bots.length < PLAYERS_COUNT) {
    console.warn(`\n⚠️ 警告: 只注册成功了 ${bots.length} 个 Bot (目标 ${PLAYERS_COUNT})`);
  } else {
    console.log(`\n✅ 成功注册全部 ${bots.length} 个 Bot`);
  }

  console.log(`\n=== 2. 构建社交网络 (全员互粉) ===`);
  for (let i = 0; i < bots.length; i++) {
    const me = bots[i];
    const others = bots.filter(b => b.playerId !== me.playerId);

    process.stdout.write(`\r[${me.name}] 正在关注 ${others.length} 人...`);

    // 并发关注所有人，提高速度
    await Promise.all(others.map(other => me.follow(other.playerId)));
  }
  console.log(`\n✅ 社交网络构建完成！\n`);

  console.log(`=== 3. 准备开始: 所有人同步好友列表 ===`);
  // 这一步很关键：确保在游戏开始前，每个人的 friends 列表都是满的
  await Promise.all(bots.map(bot => {
    return bot.fetchFriends().then(() => {
      // 可选：打印一下确认
      // console.log(`  > ${bot.name} 好友数: ${bot.friends.length}`);
    });
  }));
  console.log(`✅ 好友列表同步完成。\n`);

  console.log(`=== 4. 开始游戏循环 ===`);

  const promises = bots.map(bot => botWorker(bot));
  await Promise.all(promises);

  console.log("=== 测试结束 ===");
}

main().catch(console.error);