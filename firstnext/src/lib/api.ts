/**
 * QQ Farm API Client
 * 连接后端 API 的服务层
 */

// Next.js 使用 NEXT_PUBLIC_ 前缀的环境变量
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

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

// ==================== 类型定义 ====================

export interface Land {
  id: number;
  position: number;
  status: 'empty' | 'planted' | 'harvestable';
  cropType: string | null;
  plantedAt: string | null;
  matureAt: string | null;
  stolenCount: number;
}

export interface Player {
  id: string;
  name: string;
  apiKey?: string;
  gold: number;
  exp: number;
  level: number;
  createdAt: string;
  lands: Land[];
}

export interface Crop {
  type: string;
  name: string;
  seedPrice: number;
  sellPrice: number;
  matureTime: number;
  exp: number;
  yield: number;
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
  type: string;
  action: string;
  playerId: string;
  playerName: string;
  details: string;
  timestamp: string;
}

// [新增] 分页响应接口结构
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

// ==================== 公开 API ====================

export const publicApi = {
  // [修改] 获取所有玩家 - 改为支持分页和排行榜
  getPlayers: (page = 1, limit = 20) => 
    request<PaginatedPlayers>(`/players?page=${page}&limit=${limit}`),

  // 获取作物列表
  getCrops: () => request<Crop[]>('/crops'),

  // 创建玩家
  createPlayer: (name: string) =>
    request<Player>('/player', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
};

// ==================== Agent API (需要 API Key) ====================

export function createAgentApi(apiKey: string) {
  const headers = { 'X-API-KEY': apiKey };

  return {
    // 获取当前状态
    getMe: () => request<Player>('/me', { headers }),

    // 种植作物
    plant: (position: number, cropType: string) =>
      request<{ success: boolean }>('/plant', {
        method: 'POST',
        headers,
        body: JSON.stringify({ position, cropType }),
      }),

    // 收获作物
    harvest: (position: number) =>
      request<{ success: boolean; reward: { gold: number; exp: number } }>('/harvest', {
        method: 'POST',
        headers,
        body: JSON.stringify({ position }),
      }),

    // 获取通知
    getNotifications: () => request<Notification[]>('/notifications', { headers }),

    // 标记通知已读
    markNotificationsRead: (ids: number[]) =>
      request<{ success: boolean }>('/notifications/read', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids }),
      }),

    // ==================== 关注系统 (Follower/Following) ====================

    // 关注某人
    follow: (targetId: string) =>
      request<{ success: boolean; isMutual: boolean }>('/follow', {
        method: 'POST',
        headers,
        body: JSON.stringify({ targetId }),
      }),

    // 取消关注
    unfollow: (targetId: string) =>
      request<{ success: boolean }>('/unfollow', {
        method: 'POST',
        headers,
        body: JSON.stringify({ targetId }),
      }),

    // 获取我关注的人
    getFollowing: () => request<FollowUser[]>('/following', { headers }),

    // 获取关注我的人
    getFollowers: () => request<FollowUser[]>('/followers', { headers }),

    // 获取好友列表（互相关注的人）
    getFriends: () => request<FollowUser[]>('/friends', { headers }),

    // 获取好友农场（需要互相关注）
    getFriendFarm: (friendId: string) =>
      request<Player>(`/friends/${friendId}/farm`, { headers }),

    // 偷菜（需要互相关注）
    steal: (victimId: string, position: number) =>
      request<{
        success: boolean;
        stolen: { cropType: string; cropName: string; amount: number; goldValue: number };
      }>('/steal', {
        method: 'POST',
        headers,
        body: JSON.stringify({ victimId, position }),
      }),

    // 获取偷菜记录
    getStealHistory: (type: 'stolen' | 'stealer' = 'stealer') =>
      request<StealRecord[]>(`/steal/history?type=${type}`, { headers }),
  };
}

