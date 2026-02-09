/**
 * QQ Farm API Client
 * 连接后端 API 的服务层
 */

// Next.js 使用 NEXT_PUBLIC_ 前缀的环境变量
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const AUTH_BASE = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:3002/api/auth';

// 通用请求函数 (Game Server)
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  return fetchWithHandling<T>(url, options);
}

// 通用请求函数 (Auth Server)
async function requestAuth<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${AUTH_BASE}${endpoint}`;
  return fetchWithHandling<T>(url, options);
}

// 统一处理 Fetch 响应
async function fetchWithHandling<T>(url: string, options?: RequestInit): Promise<T> {
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
    // if (error.error === 'Already stolen by you') {
    //   // 这里的类型 T 需要包含我们手动构造的结构，或者使用 unknown 断言
    //   // 我们约定返回一个带 reason 字段的对象，让调用方 check
    //   console.warn("API suppressed error: Already stolen by you");
    //   return { success: false, reason: 'Already stolen by you', suppressed: true } as unknown as T;
    // }

    // throw new Error(error.error || 'Request failed');
    // console.warn("API error:", error);
    return { success: false, reason: error.error || 'Request failed', error } as unknown as T;
  }

  return response.json();
}

// 获取本地存储的 API Key 辅助函数
export const getAuthHeaders = (): Record<string, string> => {
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
  requiredLevel?: number;
  maxHarvests: number;
  regrowTime: number;
}

export interface DogShopItem {
  id: string;
  name: string;
  price: number;
  foodPrice: number;
  foodDuration: number;
  catchRate: number;
  bitePenalty: number;
  catchFleeRate?: number; // [新增]
}

export interface FertilizerShopItem {
  type: 'normal' | 'high';
  name: string;
  price: number;
  reduceSeconds: number;
}

export interface ShopData {
  crops: Crop[];
  dogs: DogShopItem[];
  fertilizers: FertilizerShopItem[];
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
  avatar: string;
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

export const publicApi = {
  // [修改] 改为通过 ID 获取
  getPlayerById: async (id: string) => {
    try {
      // 这里的 endpoint 对应后端的 /users/:id
      const player = await request<Player>(`/users/${id}`);

      // [修复] Check if the response is actually an error object
      // @ts-ignore
      if (player && player.success === false) {
        throw new Error("Player not found");
      }

      // 如果获取到了玩家信息，补充获取社交统计
      if (player && player.id) {
        try {
          const stats = await publicApi.getSocialStats(player.id);
          // 合并社交信息
          if (stats) {
            // @ts-ignore
            if (!stats.error) {
              player.avatar = stats.avatar;
              player.twitter = stats.twitter;
              player.createdAt = stats.createdAt;
              player._count = {
                followers: stats.followers,
                following: stats.following
              };
            }
          }
        } catch (err) {
          console.warn('Failed to fetch social stats for player:', id, err);
        }
      }
      return player;
    } catch (error) {
      throw error;
    }
  },

  // [新增] 仅获取游戏数据 (Polling 用)
  getLitePlayer: async (id: string) => {
    try {
      const player = await request<Player>(`/users/${id}`);
      // @ts-ignore
      if (player && player.success === false) {
        throw new Error("Player not found");
      }
      return player;
    } catch (error) {
      throw error;
    }
  },

  // [新增] 按名字搜索
  searchUserByName: async (name: string) => {
    // 调用 Auth Server 的 /search 接口
    return requestAuth<{ id: string; name: string; avatar: string }>(`/search?name=${encodeURIComponent(name)}`);
  },

  // getLeaderboard: (page = 1, limit = 20) =>
  //   request<PaginatedPlayers>(`/players?page=${page}&limit=${limit}`),

  getLeaderboard: (page = 1, limit = 20, sort: 'gold' | 'active' | 'level' = 'gold') =>
    request<PaginatedPlayers>(`/leaderboard?page=${page}&limit=${limit}&sort=${sort}`),

  getLogs: (playerId?: string, page = 1, limit = 50) =>
    request<PaginatedLogs>(
      playerId
        ? `/logs?playerId=${playerId}&page=${page}&limit=${limit}`
        : `/logs?page=${page}&limit=${limit}`
    ),

  getCrops: () => request<ShopData>('/crops'),


  // [Moved] 获取当前登录用户信息
  getMe: async (headers = getAuthHeaders()) => {
    return request<Player>('/me', { headers });
  },

  // --- Game Actions ---

  plant: async (position: number, cropType: string, headers = getAuthHeaders()) => {
    return request<{ success: boolean }>('/plant', {
      method: 'POST',
      headers,
      body: JSON.stringify({ position, cropType }),
    });
  },

  harvest: async (position: number, headers = getAuthHeaders()) => {
    return request<{ success: boolean; gold: number; exp: number; healthLoss?: number }>('/harvest', {
      method: 'POST',
      headers,
      body: JSON.stringify({ position }),
    });
  },

  careLand: async (position: number, type: 'water' | 'weed' | 'pest', targetId?: string, headers = getAuthHeaders()) => {
    return request<{ success: boolean; exp: number }>('/care', {
      method: 'POST',
      headers,
      body: JSON.stringify({ position, type, targetId }),
    });
  },

  steal: async (victimId: string, position: number, headers = getAuthHeaders()) => {
    return request<{
      success: boolean;
      stolen: { cropType: string; cropName: string; amount: number; goldValue: number };
      reason?: string;
      penalty?: number;
    }>('/steal', {
      method: 'POST',
      headers,
      body: JSON.stringify({ victimId, position }),
    });
  },

  shovelLand: async (position: number, targetId?: string, headers = getAuthHeaders()) => {
    return request<{ success: boolean; exp: number }>('/shovel', {
      method: 'POST',
      headers,
      body: JSON.stringify({ position, targetId }),
    });
  },

  expandLand: async (headers = getAuthHeaders()) => {
    return request<{ success: boolean; newPosition: number; cost: number }>('/expand', {
      method: 'POST',
      headers,
    });
  },

  upgradeLand: async (position: number, headers = getAuthHeaders()) => {
    return request<{ success: boolean }>('/upgrade-land', {
      method: 'POST',
      headers,
      body: JSON.stringify({ position }),
    });
  },

  useFertilizer: async (position: number, type: 'normal' | 'high', headers = getAuthHeaders()) => {
    return request<{ success: boolean; newMatureAt: string }>('/fertilize', {
      method: 'POST',
      headers,
      body: JSON.stringify({ position, type }),
    });
  },

  buyDog: async (dogId: string, headers = getAuthHeaders()) => {
    return request<{ success: boolean; message?: string }>('/dog/buy', {
      method: 'POST',
      headers,
      body: JSON.stringify({ dogId }),
    });
  },

  feedDog: async (headers = getAuthHeaders()) => {
    return request<{ success: boolean; message?: string }>('/dog/feed', {
      method: 'POST',
      headers,
    });
  },

  // --- Social Actions ---

  getFollowing: async (userId: string, page = 1, limit = 20, headers = getAuthHeaders()) => {
    return requestAuth<PaginatedFollows>(`/following?userId=${userId}&page=${page}&limit=${limit}`, { headers });
  },

  getFollowers: async (userId: string, page = 1, limit = 20, headers = getAuthHeaders()) => {
    return requestAuth<PaginatedFollows>(`/followers?userId=${userId}&page=${page}&limit=${limit}`, { headers });
  },

  // --- Notification Actions ---
  getSocialStats: async (userId: string) => {
    return requestAuth<{ followers: number; following: number; avatar: string; twitter: string; createdAt: string }>(`/stats?userId=${userId}`);
  },

  getNotifications: async (headers = getAuthHeaders()) => {
    return requestAuth<Notification[]>('/notifications', { headers });
  },

  markNotificationsRead: async (ids: number[], headers = getAuthHeaders()) => {
    return requestAuth<{ success: boolean }>('/notifications/read', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    });
  },

  // --- Other Social Actions ---
  follow: async (targetId: string, headers = getAuthHeaders()) => {
    return requestAuth<{ success: boolean; isMutual: boolean }>('/follow', {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetId }),
    });
  },

  unfollow: async (targetId: string, headers = getAuthHeaders()) => {
    return requestAuth<{ success: boolean }>('/unfollow', {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetId }),
    });
  },

  getFriends: async (headers = getAuthHeaders()) => {
    return requestAuth<FollowUser[]>('/friends', { headers });
  },

  createPlayer: async (name: string) => {
    return requestAuth('/player', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },
  // getFriendFarm: async (friendId: string, headers = getAuthHeaders()) => {
  //   return request<Player>(`/friends/${friendId}/farm`, { headers });
  // },
};
