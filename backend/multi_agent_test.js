/**
 * Multi Agent Test - Node.js Version (Robust)
 * * Usage: node multi_agent_test.js
 * * 核心逻辑 (Update):
 * 1. 初始化：加载远程配置，使用唯一Hash生成名字，循环注册直到满员。
 * 2. 社交构建：全员互粉，确保构建完整的 P2P 社交图谱。
 * 3. 游戏循环：基于最新的好友列表进行偷菜/助人/资产增值。
 */

const crypto = require('crypto'); // 引入 crypto 用于生成唯一ID

// ================= 配置区域 =================
const API_BASE = "http://localhost:3001/api";
const AUTH_BASE = "http://localhost:3002/api/auth";

const PLAYERS_COUNT = 2000; // 目标机器人数量
const LOOP_COUNT = 500;    // 每个机器人行动的回合数

// [修改] 全局作物配置 (初始为空，启动时从后端获取)
let CROPS_CONFIG = [];

// ================= 工具函数 =================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 生成唯一且易读的名字: Bot_序号_Hash前3位
const generateUniqueName = (index) => {
  const hash = crypto.randomBytes(3).toString('hex');
  return `Bot_${index}_${hash}`;
};

// [新增] 从服务器获取最新的游戏配置 (作物列表等)
async function fetchGameConfig() {
  console.log("⏳ 正在从服务器获取最新的作物配置...");
  try {
    const res = await fetch(`${API_BASE}/crops`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.crops)) {
        CROPS_CONFIG = data.crops;
        console.log(`✅ 成功加载配置: 获取到 ${CROPS_CONFIG.length} 种作物数据`);
        // 可选: 打印一下作物名称确认
        // console.log("   作物列表:", CROPS_CONFIG.map(c => c.name).join(", "));
        return true;
      }
    }
    console.error(`❌ 获取配置失败: ${res.status} ${res.statusText}`);
  } catch (e) {
    console.error(`❌ 获取配置异常 (请确认后端服务已启动):`, e.message);
  }
  return false;
}

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

    // 狗狗状态
    this.hasDog = false;
    this.dogActiveUntil = null;
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
      // 更新狗的状态
      this.hasDog = !!data.hasDog;
      this.dogActiveUntil = data.dogActiveUntil ? new Date(data.dogActiveUntil) : null;
    }
  }

  // --- 资产操作方法 ---

  async buyDog(dogId = 'dog_1') {
    const res = await this.request('/dog/buy', 'POST', { dogId }, API_BASE);
    if (res && res.success) {
      this.log(`🐕 成功购买了看门狗 (${dogId})！`);
      this.hasDog = true;
      return true;
    }
    return false;
  }

  async feedDog() {
    const res = await this.request('/dog/feed', 'POST', {}, API_BASE);
    if (res && res.success) {
      this.log(`🍖 喂食了狗狗，它现在精力充沛！`);
      return true;
    }
    return false;
  }

  async expandLand() {
    const res = await this.request('/expand', 'POST', {}, API_BASE);
    if (res && res.success) {
      this.log(`🏡 扩建成功！当前拥有 ${res.landCount} 块土地`);
      return true;
    }
    return false;
  }

  async upgradeLand(position) {
    const res = await this.request('/upgrade-land', 'POST', { position }, API_BASE);
    if (res && res.success) {
      this.log(`✨ 土地[${position}] 升级为 ${res.newType}`);
      return true;
    }
    return false;
  }

  // ================= 核心行动逻辑 =================
  async playTurn() {
    if (!this.apiKey) return;

    // 1. 刷新状态
    await this.refreshState();

    // 2. 刷新好友
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
      // [修改] 使用全局配置 CROPS_CONFIG
      // 注意：后端返回的字段通常是 requiredLevel 和 requiredLandType，而不是之前的 levelReq/landReq
      // 根据你的后端 game-keys.ts，字段名应该是: requiredLevel, requiredLandType, seedPrice
      const availableCrops = CROPS_CONFIG.filter(c =>
        (c.requiredLevel || c.levelReq || 0) <= this.level &&
        c.seedPrice <= this.gold
      );

      if (availableCrops.length > 0) {
        const targetLand = randomChoice(emptyLands);
        const cropToPlant = randomChoice(availableCrops);

        // 检查土地需求
        const reqLand = cropToPlant.requiredLandType || cropToPlant.landReq || 'normal';
        // 简单逻辑：如果是高级作物但地是普通的，则跳过 (为了简化，这里只做简单判断)
        if (reqLand !== 'normal' && targetLand.landType === 'normal') {
          // pass
        } else {
          const res = await this.request('/plant', 'POST', { position: targetLand.position, cropType: cropToPlant.type });
          if (res && res.success) {
            this.gold -= cropToPlant.seedPrice;
            this.log(`种植了 ${cropToPlant.name}`);
          }
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

    // 5. === 资产增值 (低频) ===
    if (Math.random() < 0.05) {
      await this.doWealthManagement();
    }
  }

  // --- 财富管理子程序 ---
  async doWealthManagement() {
    // 1. 狗狗管理 (dog_1 price is 2000)
    if (!this.hasDog && this.gold > 2500) {
      await this.buyDog('dog_1');
      return;
    }

    if (this.hasDog && this.dogActiveUntil) {
      const timeLeft = this.dogActiveUntil.getTime() - Date.now();
      if (timeLeft < 60 * 1000 && this.gold > 100) {
        await this.feedDog();
        return;
      }
    }

    // 2. 扩建
    const isFull = this.lands.every(l => l.status !== 'empty');
    if (isFull && this.gold > 2500) {
      const success = await this.expandLand();
      if (success) return;
    }

    // 3. 升级土地
    if (this.gold > 3500) {
      const normalLand = this.lands.find(l => l.landType === 'normal');
      if (normalLand) {
        await this.upgradeLand(normalLand.position);
        return;
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

async function loadBotsFromDB() {
  console.log(`=== 1. 初始化: 从数据库直接加载 Bot (Direct DB) ===`);
  let client;
  try {
    let pg;
    try {
      pg = require('./backend/node_modules/pg');
    } catch (e) {
      try {
        pg = require('pg');
      } catch (e2) {
        console.error("❌ 无法加载 'pg' 模块。请确保在 backend 目录下安装了 pg (npm install pg)");
        process.exit(1);
      }
    }

    const { Client } = pg;
    const connectionString = "postgresql://farm_user:farm_password_2024@localhost:5432/qq_farm?schema=public";

    client = new Client({ connectionString });
    await client.connect();

    const res = await client.query(`
            SELECT id, name, "apiKey", level, gold, lands 
            FROM "Player" 
            ORDER BY "createdAt" DESC 
            LIMIT ${PLAYERS_COUNT}
        `);

    const players = res.rows;
    console.log(`✅ 从数据库加载了 ${players.length} 个玩家`);

    return players.map(p => {
      const agent = new FarmAgent(p.name);
      agent.playerId = p.id;
      agent.apiKey = p.apiKey;
      agent.gold = p.gold;
      agent.level = p.level;
      agent.lands = p.lands || [];
      return agent;
    });

  } catch (e) {
    console.error("❌ 数据库查询失败:", e);
    return [];
  } finally {
    if (client) await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const loadFromDB = args.includes('--load-db');

  // [修改] 先尝试获取配置
  const configLoaded = await fetchGameConfig();
  if (!configLoaded || CROPS_CONFIG.length === 0) {
    console.warn("⚠️ 警告: 无法加载作物配置，Bot 将无法进行种植操作！");
  }

  let bots = [];

  if (loadFromDB) {
    bots = await loadBotsFromDB();
    if (bots.length === 0) {
      console.error("没有加载到任何 Bot，退出。");
      return;
    }
  } else {
    console.log(`=== 1. 初始化: 尝试注册 ${PLAYERS_COUNT} 个 Bot ===`);

    let attempts = 0;
    while (bots.length < PLAYERS_COUNT && attempts < PLAYERS_COUNT * 2) {
      attempts++;
      const botName = generateUniqueName(bots.length + 1);
      const bot = new FarmAgent(botName);

      if (await bot.register()) {
        bots.push(bot);
      }
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
      await Promise.all(others.map(other => me.follow(other.playerId)));
    }
    console.log(`\n✅ 社交网络构建完成！\n`);
  }

  console.log(`=== 3. 准备开始: 所有人同步好友列表 ===`);
  await Promise.all(bots.map(bot => {
    return bot.fetchFriends();
  }));
  console.log(`✅ 好友列表同步完成。\n`);

  console.log(`=== 4. 开始游戏循环 ===`);

  const promises = bots.map(bot => botWorker(bot));
  await Promise.all(promises);

  console.log("=== 测试结束 ===");
}

main().catch(console.error);