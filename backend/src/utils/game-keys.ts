// backend/src/utils/game-keys.ts

// 土地状态枚举
export enum LandStatus {
  EMPTY = 'empty',             // 空地
  PLANTED = 'planted',         // 生长中
  HARVESTABLE = 'harvestable', // 可收获
  WITHERED = 'withered'        // 已枯萎 (需要铲除)
}

// [新增] 升级经验表 (索引0 = 1级升2级所需经验, 索引1 = 2级升3级...)
// 这里的数值是"当前等级升级到下一级所需的增量经验"
const LEVEL_UP_EXP = [
  100,   // Lv1 -> Lv2
  200,   // Lv2 -> Lv3
  400,   // Lv3 -> Lv4
  800,   // Lv4 -> Lv5
  1500,  // Lv5 -> Lv6
  2500,  // Lv6 -> Lv7
  4000,  // Lv7 -> Lv8
  6000,  // Lv8 -> Lv9
  9000,  // Lv9 -> Lv10
  // Lv10+ (每级递增 3000-5000)
  13000, 18000, 24000, 31000, 39000, 48000, 58000, 69000, 81000, 94000, 108000,
  // Lv20+
  125000, 145000, 170000, 200000, 240000, 290000, 350000, 420000, 500000, 600000,
  // 30+ 级以后可以是极其巨大的数字，防止轻易满级
  999999999
];

export const GAME_CONFIG = {
  // 导出经验表供 Lua 使用
  LEVEL_UP_EXP,

  // Service-level constants
  MAX_DAILY_CARE_EXP: 1000,
  DISASTER_CHECK_INTERVAL: 60 * 1000 * 1, // 1 minute in milliseconds
  REDIS_PLAYER_CACHE_TTL: 60 * 60 * 24 * 3, // 3 days in seconds

  LAND: {
    INITIAL_COUNT: 6,
    MAX_LIMIT: 18,
    EXPAND_BASE_COST: 1000
  },

  // 经验倍率配置
  EXP_RATES: {
    PLANT: 10,
    SHOVEL: 10,
    CARE: 10,
  },

  LAND_LEVELS: ['normal', 'red', 'black', 'gold'] as const,

  LAND_UPGRADE: {
    normal: { price: 5000, next: 'red', levelReq: 5 },
    red: { price: 20000, next: 'black', levelReq: 15 },
    black: { price: 100000, next: 'gold', levelReq: 30 },
    gold: { price: 0, next: '', levelReq: 999 }
  },

  FERTILIZER: {
    normal: { price: 50, reduceSeconds: 3600 },
    high: { price: 200, reduceSeconds: 14400 }
  },

  // 看守狗配置
  DOG: {
    PRICE: 2000,          // 买狗价格
    FOOD_PRICE: 200,      // 狗粮价格
    FOOD_DURATION: 86400, // 持续时间(秒)
    CATCH_RATE: 40,       // 咬人几率 (40%)
    BITE_PENALTY: 200     // 被咬罚款 (200金币)
  },

  BASE_RATES: {
    STEAL_PENALTY: 0.1,  // 被偷一次扣10%
    HEALTH_PENALTY: 0.05  // 有害虫/杂草扣20%
  },

  DISASTER: {
    PROB_WEED: 40,
    PROB_PEST: 40,
    PROB_WATER: 40
  }
};

export const CROPS = [
  // [Normal Land]
  {
    type: 'radish',
    name: 'Radish',
    seedPrice: 10,
    sellPrice: 15,
    matureTime: 30,
    exp: 2,
    yield: 1,
    maxHarvests: 1,
    regrowTime: 0,
    requiredLandType: 'normal',
    requiredLevel: 1
  },
  {
    type: 'carrot',
    name: 'Carrot',
    seedPrice: 10,
    sellPrice: 25,
    matureTime: 60,
    yield: 1,
    exp: 5,
    maxHarvests: 1,
    regrowTime: 0,
    requiredLandType: 'normal',
    requiredLevel: 1
  },
  {
    type: 'potato',
    name: 'Potato',
    seedPrice: 150,
    sellPrice: 280,
    matureTime: 600,
    exp: 40,
    yield: 2,
    maxHarvests: 1,
    regrowTime: 0,
    requiredLandType: 'normal',
    requiredLevel: 3
  },
  {
    type: 'corn',
    name: 'Corn',
    seedPrice: 50,
    sellPrice: 60,
    matureTime: 120,
    exp: 10,
    yield: 2,
    maxHarvests: 5,
    regrowTime: 60,
    requiredLandType: 'normal',
    requiredLevel: 2
  },
  // [Red Land]
  {
    type: 'strawberry',
    name: 'Strawberry',
    seedPrice: 80,
    sellPrice: 100,
    matureTime: 180,
    exp: 15,
    yield: 2,
    maxHarvests: 3,
    regrowTime: 90,
    requiredLandType: 'red',
    requiredLevel: 5
  },
  {
    type: 'tomato',
    name: 'Tomato',
    seedPrice: 200,
    sellPrice: 180,
    matureTime: 300,
    exp: 25,
    yield: 3,
    maxHarvests: 4,
    regrowTime: 120,
    requiredLandType: 'red',
    requiredLevel: 8
  },
  {
    type: 'watermelon',
    name: 'Watermelon',
    seedPrice: 150,
    sellPrice: 120,
    matureTime: 300,
    exp: 25,
    yield: 3,
    maxHarvests: 1,
    regrowTime: 0,
    requiredLandType: 'red',
    requiredLevel: 6
  },
  // [Black Land]
  {
    type: 'rose',
    name: 'Rose',
    seedPrice: 500,
    sellPrice: 1200,
    matureTime: 1800,
    exp: 100,
    yield: 1,
    maxHarvests: 1,
    regrowTime: 0,
    requiredLandType: 'black',
    requiredLevel: 15
  },
  // [Gold Land]
  {
    type: 'ginseng',
    name: 'Ginseng',
    seedPrice: 5000,
    sellPrice: 20000,
    matureTime: 43200,
    exp: 1000,
    yield: 1,
    maxHarvests: 1,
    regrowTime: 0,
    requiredLandType: 'gold',
    requiredLevel: 30
  }
];