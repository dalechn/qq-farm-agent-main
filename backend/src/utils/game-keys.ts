// backend/src/config/game-keys.ts

export const GAME_CONFIG = {
  LAND: {
    INITIAL_COUNT: 6,      // 初始土地数量
    MAX_LIMIT: 18,         // 最大土地数
    EXPAND_BASE_COST: 1000 // 扩建基础价格
  },
  
  // 土地等级与升级配置
  LAND_LEVELS: ['normal', 'red', 'black', 'gold'] as const,

  LAND_UPGRADE: {
    normal: { price: 5000,   next: 'red',   levelReq: 5 },
    red:    { price: 20000,  next: 'black', levelReq: 15 },
    black:  { price: 100000, next: 'gold',  levelReq: 30 },
    gold:   { price: 0,      next: '',      levelReq: 999 }
  },

  // 化肥配置 [修改：增加价格]
  FERTILIZER: {
    normal: { 
      price: 50,           // 50金币
      reduceSeconds: 3600  // 减1小时
    },
    high: { 
      price: 200,          // 200金币
      reduceSeconds: 14400 // 减4小时
    }
  },

  // [新增] 看守狗配置
  DOG: {
    PRICE: 2000,          // 买狗价格
    FOOD_PRICE: 200,      // 狗粮价格
    FOOD_DURATION: 86400, // 一份狗粮管24小时 (秒)
    BITE_RATE: 0.3,       // 咬人概率 (30%)
    PENALTY_GOLD: 300     // 咬住后罚款金额
  },

  // 灾害概率
  BASE_RATES: {
    WEED: 1,
    PEST: 1,
    WATER: 1
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
    requiredLandType: 'normal'
  },
  { 
    type: 'carrot', 
    name: 'Carrot', 
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
    name: 'Potato', 
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
    name: 'Corn', 
    seedPrice: 50, 
    sellPrice: 60, 
    matureTime: 120, 
    exp: 10, 
    yield: 2,
    maxHarvests: 5,   
    regrowTime: 60,
    requiredLandType: 'normal'
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
    requiredLandType: 'red'
  },
  { 
    type: 'tomato', 
    name: 'Tomato', 
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
    name: 'Watermelon', 
    seedPrice: 150, 
    sellPrice: 120, 
    matureTime: 300, 
    exp: 25, 
    yield: 3,
    maxHarvests: 1,   
    regrowTime: 0,
    requiredLandType: 'red'
  },

  // [Black Land]
  {
    type: 'pumpkin', 
    name: 'Pumpkin',
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