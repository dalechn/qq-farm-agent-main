// backend/src/config/game.ts

// ==========================================
// 1. 土地配置
// ==========================================
export const GAME_CONFIG = {
  LAND: {
    INITIAL_COUNT: 6,      // 初始土地数量
    MAX_LIMIT: 18,         // 最大土地数
    EXPAND_BASE_COST: 1000 // 扩建基础价格 (第7块=1000, 第8块=2000...)
  },
  
  // 土地等级与升级配置
  LAND_LEVELS: ['normal', 'red', 'black', 'gold'] as const,

  LAND_UPGRADE: {
    normal: { price: 5000,   next: 'red',   levelReq: 5 },
    red:    { price: 20000,  next: 'black', levelReq: 15 },
    black:  { price: 100000, next: 'gold',  levelReq: 30 },
    gold:   { price: 0,      next: '',      levelReq: 999 }
  },

  // 化肥配置
  FERTILIZER: {
    normal: { 
      price: 50,           // [新增] 价格：50金币
      reduceSeconds: 3600  // 减1小时
    }, 
    high: { 
      price: 200,          // [新增] 价格：200金币
      reduceSeconds: 14400 // 减4小时
    } 
  },

  // 灾害概率 (每分钟发生的几率, 1=100%, 建议 0.05=5%)
  BASE_RATES: {
    WEED: 1,  // 调试用 100%
    PEST: 1,  // 调试用 100%
    WATER: 1  // 调试用 100%
  }
};

// ==========================================
// 2. 作物配置 (需与前端 firstnext/src/lib/api.ts 保持一致)
// ==========================================
export const CROPS = [
  // [普通土地] 适合新手
  { 
    type: 'radish', 
    name: '白萝卜', 
    seedPrice: 10, 
    sellPrice: 15, 
    matureTime: 30, 
    exp: 2, 
    yield: 1,
    maxHarvests: 1, 
    regrowTime: 0,
    requiredLandType: 'normal'
  },
  { 
    type: 'carrot', 
    name: '胡萝卜', 
    seedPrice: 20, 
    sellPrice: 35, 
    matureTime: 60, 
    exp: 5, 
    yield: 1,
    maxHarvests: 1, 
    regrowTime: 0,
    requiredLandType: 'normal'
  },
  { 
    type: 'potato',
    name: '土豆', 
    seedPrice: 150, 
    sellPrice: 280, 
    matureTime: 600, 
    exp: 40, 
    yield: 1,
    maxHarvests: 1, 
    regrowTime: 0,
    requiredLandType: 'normal'
  },
  { 
    type: 'corn', 
    name: '玉米', 
    seedPrice: 50, 
    sellPrice: 60, 
    matureTime: 120, 
    exp: 10, 
    yield: 2,
    maxHarvests: 5,   
    regrowTime: 60,
    requiredLandType: 'normal'
  },

  // [红土地] 进阶作物
  { 
    type: 'strawberry', 
    name: '草莓', 
    seedPrice: 80, 
    sellPrice: 100, 
    matureTime: 180, 
    exp: 15, 
    yield: 2,
    maxHarvests: 3,   
    regrowTime: 90,
    requiredLandType: 'red'
  },
  { 
    type: 'tomato', 
    name: '番茄', 
    seedPrice: 200, 
    sellPrice: 180, 
    matureTime: 240, 
    exp: 20, 
    yield: 2,
    maxHarvests: 4,   
    regrowTime: 120,
    requiredLandType: 'red'
  },
  { 
    type: 'watermelon', 
    name: '西瓜', 
    seedPrice: 150, 
    sellPrice: 120, 
    matureTime: 300, 
    exp: 25, 
    yield: 3,
    maxHarvests: 1,   
    regrowTime: 0,
    requiredLandType: 'red'
  },

  // [黑土地] 高级作物
  {
    type: 'pumpkin', 
    name: '南瓜',
    seedPrice: 500,
    sellPrice: 1200,
    matureTime: 1800, 
    exp: 100,
    yield: 1,
    maxHarvests: 1,
    regrowTime: 0,
    requiredLandType: 'black'
  }
];

