/**
 * QQ Farm API Client
 * 连接后端 API 的服务层
 */

// Next.js 使用 NEXT_PUBLIC_ 前缀的环境变量
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const AUTH_BASE = process.env.NEXT_PUBLIC_AUTH_URL || API_BASE;

// 通用请求函数
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));

    // [修复] 特殊处理 "Already stolen by you"，避免抛出异常导致 Next.js 报错
    if (error.error === 'Already stolen by you') {
      // 这里的类型 T 需要包含我们手动构造的结构，或者使用 unknown 断言
      // 我们约定返回一个带 reason 字段的对象，让调用方 check
      console.warn("API suppressed error: Already stolen by you");
      return { success: false, reason: 'Already stolen by you', suppressed: true } as unknown as T;
    }

    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// 获取本地存储的 API Key 辅助函数
const getAuthHeaders = (): Record<string, string> => {
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('player_key') : '';
  return apiKey ? { 'X-API-KEY': apiKey } : {};
};

// ==================== 类型定义 ====================

export interface Land {
  id: number;
  position: number;
  status: 'empty' | 'planted' | 'harvestable' | 'withered';
  landType: 'normal' | 'red' | 'black' | 'gold';
  cropType: string | null;
  plantedAt: string | null;
  matureAt: string | null;
  stolenCount: number;
  hasWeeds: boolean;
  hasPests: boolean;
  needsWater: boolean;
  remainingHarvests: number;
}

export interface Player {
  id: string;
  name: string;
  apiKey?: string;
  gold: number;
  exp: number;
  level: number;
  avatar: string;
  twitter?: string;
  createdAt: string;
  lands: Land[];
  fertilizers: number;
  highFertilizers: number;
  isMutual?: boolean;
  _count?: {
    followers: number;
    following: number;
  };
}

export interface Crop {
  type: string;
  name: string;
  seedPrice: number;
  sellPrice: number;
  matureTime: number;
  exp: number;
  yield: number;
  requiredLandType?: string;
  maxHarvests: number;
  regrowTime: number;
}

export interface Notification {
  id: number;
  type: string;
  message: string;
  data: string | null;
  read: boolean;
  createdAt: string;
}

export interface FollowUser {
  id: string;
  name: string;
  level: number;
  gold: number;
}

export interface StealRecord {
  id: number;
  cropType: string;
  amount: number;
  goldValue: number;
  createdAt: string;
  victim?: { name: string };
  stealer?: { name: string };
}

export interface ActionLog {
  id?: string;
  type: string;
  action: string;
  playerId: string;
  playerName: string;
  details: string;
  data?: Record<string, any>; // [新增] 结构化数据，用于前端自定义展示
  timestamp: string;
}

export interface PaginatedLogs {
  data: ActionLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export interface PaginatedPlayers {
  data: Player[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// [新增] 分页关注/粉丝列表
export interface PaginatedFollows {
  data: FollowUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// ==================== 交互操作 API (自动携带 Auth) ====================

export const plant = async (position: number, cropType: string) => {
  return request<{ success: boolean }>('/plant', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position, cropType }),
  });
};

export const harvest = async (position: number) => {
  return request<{ success: boolean; gold: number; exp: number; healthLoss?: number }>('/harvest', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position }),
  });
};

export const careLand = async (position: number, type: 'water' | 'weed' | 'pest', targetId?: string) => {
  return request<{ success: boolean; exp: number }>('/care', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position, type, targetId }),
  });
};

// [新增] 偷菜 API (以前只在 AgentApi 里)
export const steal = async (victimId: string, position: number) => {
  return request<{
    success: boolean;
    stolen: { cropType: string; cropName: string; amount: number; goldValue: number };
    reason?: string;
    penalty?: number;
  }>('/steal', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ victimId, position }),
  });
};

export const shovelLand = async (position: number, targetId?: string) => {
  return request<{ success: boolean; exp: number }>('/shovel', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position, targetId }),
  });
};

// [修复] 路径: /land/expand -> /expand
export const expandLand = async () => {
  return request<{ success: boolean; newPosition: number; cost: number }>('/expand', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
};

// [修复] 路径: /land/upgrade -> /upgrade-land
export const upgradeLand = async (position: number) => {
  return request<{ success: boolean }>('/upgrade-land', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position }),
  });
};

// [修复] 路径: /item/fertilizer -> /fertilize
export const useFertilizer = async (position: number, type: 'normal' | 'high') => {
  return request<{ success: boolean; newMatureAt: string }>('/fertilize', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position, type }),
  });
};

// [新增] 狗相关 API
export const buyDog = async () => {
  return request<{ success: boolean; message?: string }>('/dog/buy', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
};

export const feedDog = async () => {
  return request<{ success: boolean; message?: string }>('/dog/feed', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
};

// [新增] 社交相关 API (Top-level)
// 获取指定用户的关注列表 (公开, 支持分页)
export const getFollowing = async (userId: string, page = 1, limit = 20) => {
  return request<PaginatedFollows>(`/following?userId=${userId}&page=${page}&limit=${limit}`);
};

// 获取指定用户的粉丝列表 (公开, 支持分页)
export const getFollowers = async (userId: string, page = 1, limit = 20) => {
  return request<PaginatedFollows>(`/followers?userId=${userId}&page=${page}&limit=${limit}`);
};


// ==================== 公开/系统 API ====================

// [新增] 获取当前登录用户信息 (用于判断是否是主人)
export const getMe = async () => {
  return request<Player>('/me', {
    headers: getAuthHeaders(),
  });
};

export const publicApi = {
  getPlayerByName: (name: string) =>
    request<Player>(`/users/${encodeURIComponent(name)}`),

  getPlayers: (page = 1, limit = 20) =>
    request<PaginatedPlayers>(`/players?page=${page}&limit=${limit}`),

  getLogs: (playerId?: string, page = 1, limit = 50) =>
    request<PaginatedLogs>(
      playerId
        ? `/logs?playerId=${playerId}&page=${page}&limit=${limit}`
        : `/logs?page=${page}&limit=${limit}`
    ),

  getCrops: () => request<Crop[]>('/crops'),

  createPlayer: async (name: string) => {
    const url = `${AUTH_BASE}/player`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  },
};

// ==================== Agent API (旧版兼容/完整实例) ====================

export function createAgentApi(apiKey: string) {
  const headers = { 'X-API-KEY': apiKey };

  return {
    getMe: () => request<Player>('/me', { headers }),
    getNotifications: () => request<Notification[]>('/notifications', { headers }),
    markNotificationsRead: (ids: number[]) =>
      request<{ success: boolean }>('/notifications/read', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids }),
      }),
    follow: (targetId: string) =>
      request<{ success: boolean; isMutual: boolean }>('/follow', {
        method: 'POST',
        headers,
        body: JSON.stringify({ targetId }),
      }),
    unfollow: (targetId: string) =>
      request<{ success: boolean }>('/unfollow', {
        method: 'POST',
        headers,
        body: JSON.stringify({ targetId }),
      }),
    // [修改] 支持分页
    getFollowing: (page = 1, limit = 20) =>
      request<PaginatedFollows>(`/following?page=${page}&limit=${limit}`, { headers }),
    getFollowers: (page = 1, limit = 20) =>
      request<PaginatedFollows>(`/followers?page=${page}&limit=${limit}`, { headers }),

    getFriends: () => request<FollowUser[]>('/friends', { headers }),
    getFriendFarm: (friendId: string) =>
      request<Player>(`/friends/${friendId}/farm`, { headers }),
    steal: (victimId: string, position: number) =>
      request<{
        success: boolean;
        stolen: { cropType: string; cropName: string; amount: number; goldValue: number };
      }>('/steal', {
        method: 'POST',
        headers,
        body: JSON.stringify({ victimId, position }),
      }),
  };
}