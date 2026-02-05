/**
 * QQ Farm API Client
 * 连接后端 API 的服务层
 */

// Next.js 使用 NEXT_PUBLIC_ 前缀的环境变量
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// 获取本地存储的 API Key 辅助函数
const getAuthHeaders = () => {
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('player_key') : '';
  return apiKey ? { 'X-API-KEY': apiKey } : {};
};

// ==================== 类型定义 ====================

export interface Land {
  id: number;
  position: number;
  status: 'empty' | 'planted' | 'harvestable' | 'withered';
  // [新增] 土地类型
  landType: 'normal' | 'red' | 'black' | 'gold'; 
  cropType: string | null;
  plantedAt: string | null;
  matureAt: string | null;
  stolenCount: number;
  
  // 灾害与多季状态
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
  
  // [新增] 化肥库存
  fertilizers: number;
  highFertilizers: number;
  
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
  // [新增] 种植限制
  requiredLandType?: string; 
  // 多季配置
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

// ==================== 交互操作 API (自动携带 Auth) ====================

export const plant = async (position: number, cropType: string) => {
  return request<{ success: boolean }>('/plant', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position, cropType }),
  });
};

export const harvest = async (position: number) => {
  return request<{ success: boolean; reward: { gold: number; exp: number } }>('/harvest', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position }),
  });
};

// 照料 (浇水/除草/杀虫)
export const careLand = async (position: number, type: 'water' | 'weed' | 'pest') => {
  return request<{ success: boolean; exp: number }>('/care', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position, type }),
  });
};

// 铲除枯萎作物
export const shovelLand = async (position: number) => {
  return request<{ success: boolean; exp: number }>('/shovel', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position }),
  });
};

// [新增] 扩建土地
export const expandLand = async () => {
  return request<{ success: boolean; newPosition: number; cost: number }>('/land/expand', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
};

// [新增] 升级土地
export const upgradeLand = async (position: number) => {
  return request<{ success: boolean }>('/land/upgrade', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position }),
  });
};

// [新增] 使用化肥
export const useFertilizer = async (position: number, type: 'normal' | 'high') => {
  return request<{ success: boolean; newMatureAt: string }>('/item/fertilizer', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ position, type }),
  });
};

// ==================== 公开/系统 API ====================

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

  createPlayer: (name: string) =>
    request<Player>('/player', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
};

// ==================== Agent API (旧版兼容) ====================

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
    getFollowing: () => request<FollowUser[]>('/following', { headers }),
    getFollowers: () => request<FollowUser[]>('/followers', { headers }),
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
    getStealHistory: (type: 'stolen' | 'stealer' = 'stealer') =>
      request<StealRecord[]>(`/steal/history?type=${type}`, { headers }),
  };
}