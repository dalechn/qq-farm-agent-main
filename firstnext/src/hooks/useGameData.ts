// src/hooks/useGameData.ts

import { useState, useEffect, useCallback } from 'react';
import { publicApi, type Player, type Crop, type ActionLog, type ShopData } from '@/lib/api';
// import { useWebSocket, WebSocketMessage } from './useWebSocket';

interface UseGameDataOptions {
  refreshInterval?: number;
}

// 定义排序类型
export type SortType = 'gold' | 'active' | 'level';

export function useGameData(options: UseGameDataOptions = {}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { refreshInterval = 5000 } = options;

  const [players, setPlayers] = useState<Player[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [shopData, setShopData] = useState<ShopData | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 玩家列表分页状态
  const [playerPage, setPlayerPage] = useState(1);
  const [hasMorePlayers, setHasMorePlayers] = useState(true);
  const [isFetchingMorePlayers, setIsFetchingMorePlayers] = useState(false);
  const [totalPlayersCount, setTotalPlayersCount] = useState(0);
  // [新增] 玩家列表刷新状态 (非分页加载)
  const [isRefreshingPlayers, setIsRefreshingPlayers] = useState(false);

  // [新增] 排序状态
  const [sortBy, setSortBy] = useState<SortType>('gold');

  // 日志分页状态
  const [logPage, setLogPage] = useState(1);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [isFetchingMoreLogs, setIsFetchingMoreLogs] = useState(false);

  // [新增] 活动中心UI状态
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  const updatePlayer = useCallback((updatedPlayer: Player) => {
    setPlayers(prev => prev.map(p => {
      if (p.id === updatedPlayer.id) {
        return updatedPlayer;
      }
      return p;
    }));

    setMyPlayer(prevMyPlayer => {
      if (prevMyPlayer && prevMyPlayer.id === updatedPlayer.id) {
        return updatedPlayer;
      }
      return prevMyPlayer;
    });
  }, []);

  // 获取玩家列表 (包含排序逻辑)
  const fetchPlayers = useCallback(async (pageNum: number, isLoadMore = false) => {
    try {
      if (isLoadMore) {
        setIsFetchingMorePlayers(true);
      } else {
        setIsRefreshingPlayers(true);
      }

      // 使用当前的 sortBy
      const response = await publicApi.getLeaderboard(pageNum, 20, sortBy);

      if (isLoadMore) {
        setPlayers(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPlayers = response.data.filter(p => !existingIds.has(p.id));
          return [...prev, ...newPlayers];
        });
      } else {
        setPlayers(response.data);
      }

      setTotalPlayersCount(response.pagination.total);
      setHasMorePlayers(response.pagination.hasMore);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsFetchingMorePlayers(false);
      setIsRefreshingPlayers(false);
    }
  }, [sortBy]); // 依赖 sortBy

  // [新增] 当排序改变时，重置列表并刷新
  useEffect(() => {
    // 切换排序时，先清空列表或显示加载态
    setPlayers([]);
    setPlayerPage(1);
    setHasMorePlayers(true);
    // 重新获取第一页
    fetchPlayers(1, false);
  }, [sortBy, fetchPlayers]);

  const loadMorePlayers = useCallback(() => {
    if (!hasMorePlayers || isFetchingMorePlayers) return;
    const nextPage = playerPage + 1;
    setPlayerPage(nextPage);
    fetchPlayers(nextPage, true);
  }, [playerPage, hasMorePlayers, isFetchingMorePlayers, fetchPlayers]);

  const fetchCrops = useCallback(async () => {
    try {
      const data = await publicApi.getCrops();
      setShopData(data);
      setCrops(data.crops);
    } catch (err: any) {
      console.warn('Failed to fetch crops:', err);
    }
  }, []);

  const fetchLogs = useCallback(async (pageNum: number, isLoadMore = false, playerId?: string) => {
    try {
      if (isLoadMore) setIsFetchingMoreLogs(true);
      const response = await publicApi.getLogs(playerId, pageNum, 50);

      if (isLoadMore) {
        setLogs(prev => {
          const existingIds = new Set(prev.map(l => l.id));
          const newLogs = response.data.filter(l => (l.id ? !existingIds.has(l.id) : true));
          return [...prev, ...newLogs];
        });
      } else {
        setLogs(response.data);
      }
      setHasMoreLogs(response.pagination.hasMore);
    } catch (err: any) {
      console.warn('Failed to fetch logs:', err);
    } finally {
      setIsFetchingMoreLogs(false);
    }
  }, []);

  const loadMoreLogs = useCallback((playerId?: string) => {
    if (!hasMoreLogs || isFetchingMoreLogs) return;
    const nextPage = logPage + 1;
    setLogPage(nextPage);
    fetchLogs(nextPage, true, playerId);
  }, [logPage, hasMoreLogs, isFetchingMoreLogs, fetchLogs]);

  const fetchMe = useCallback(async () => {
    if (typeof window !== 'undefined' && localStorage.getItem('player_key')) {
      try {
        const me = await publicApi.getMe();
        setMyPlayer(me);
      } catch (e) {
        console.warn("Failed to fetch my info (invalid key?)", e);
      }
    }
  }, []);

  const refreshPlayers = useCallback(() => {
    setPlayerPage(1);
    fetchPlayers(1, false);
  }, [fetchPlayers]);

  const refreshLogs = useCallback(() => {
    setLogPage(1);
    fetchLogs(1);
  }, [fetchLogs]);

  // 初始化（注意：fetchPlayers 已经在 sortBy 的 useEffect 里被调用了，所以这里可以只负责其他初始化）
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([
        // fetchPlayers(1), // 这里的调用其实和 sortBy 的 useEffect 重复了，不过 React 18+ 一般会合并，或者可以保留以确保初始化
        fetchCrops(),
        fetchLogs(1),
        fetchMe()
      ]);
      setIsLoading(false);
    };
    init();
  }, [/* fetchPlayers, */ fetchCrops, fetchLogs, fetchMe]);

  /*
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'player_joined':
        setTotalPlayersCount(prev => prev + 1);
        break;
      // case 'action':
      //   // [新增] 实时接收广播并追加到日志列表
      //   // 构造 ActionLog 对象
      //   const newLog: ActionLog = {
      //     id: `ws-${Date.now()}-${Math.random()}`, // 临时 ID
      //     type: 'action',
      //     action: message.action,
      //     playerId: message.playerId,
      //     playerName: message.playerName || 'Unknown',
      //     details: message.details,
      //     data: message.data,
      //     timestamp: new Date().toISOString()
      //   };

      //   setLogs(prev => [newLog, ...prev]);
      //   break;
      default:
        break;
    }
  }, []);

  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
  });
  */
  const isConnected = false;

  const stats = {
    totalPlayers: totalPlayersCount,
    loadedCount: players.length,
    harvestableCount: players.reduce(
      (sum, p) => sum + p.lands.filter((l) => l.status === 'harvestable').length,
      0
    ),
  };

  return {
    players,
    myPlayer,
    crops,
    shopData,
    logs,
    stats,
    isLoading,

    isFetchingMorePlayers,
    hasMorePlayers,
    loadMorePlayers,

    isFetchingMoreLogs,
    hasMoreLogs,
    loadMoreLogs,
    refreshLogs,

    refreshPlayers,
    isRefreshingPlayers,

    // 暴露排序控制
    sortBy,
    setSortBy,

    updatePlayer,
    fetchMe,

    error,
    isConnected,
    isActivityOpen,
    setIsActivityOpen,
    refresh: () => {
      setPlayerPage(1);
      setLogPage(1);
      fetchPlayers(1);
      fetchLogs(1);
      fetchMe();
    },
  };
}