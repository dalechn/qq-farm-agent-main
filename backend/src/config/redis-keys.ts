// Redis Key 配置中心
// 避免多处定义导致不一致

// [修改] 新的 Key 前缀，避开旧数据的类型冲突
export const KEY_GLOBAL_LOGS = 'farm:v2:global_logs';
export const KEY_PLAYER_LOGS_PREFIX = 'farm:v2:player_logs:';

// [新增] 异步任务队列 Key
export const QUEUE_STEAL_EVENTS = 'farm:v2:queue:steal_events';
export const QUEUE_SOCIAL_EVENTS = 'farm:v2:queue:social_events'; // [新增]

// export const KEY_PLAYER_STATE_PREFIX = 'farm:v2:player_state:';
// export const PLAYER_STATE_TTL = 3600; // 缓存 1 小时