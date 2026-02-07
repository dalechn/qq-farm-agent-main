// src/hooks/useGameData.ts

import { useState, useEffect, useCallback } from 'react';
import { publicApi, getMe, Player, Crop, ActionLog, ShopData } from '@/lib/api';
import { useWebSocket, WebSocketMessage } from './useWebSocket';

interface UseGameDataOptions {
  refreshInterval?: number;
}

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

  // 日志分页状态
  const [logPage, setLogPage] = useState(1);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [isFetchingMoreLogs, setIsFetchingMoreLogs] = useState(false);

  // ==========================================
  // [修复] 更新玩家数据
  // 移除 [myPlayer] 依赖，防止在 FarmDashboard 中引发 useEffect 死循环
  // ==========================================
  const updatePlayer = useCallback((updatedPlayer: Player) => {
    setPlayers(prev => prev.map(p => {
      if (p.id === updatedPlayer.id) {
        return updatedPlayer;
      }
      return p;
    }));

    // 使用函数式更新来检查 prevMyPlayer，无需将 myPlayer 加入依赖数组
    setMyPlayer(prevMyPlayer => {
      if (prevMyPlayer && prevMyPlayer.id === updatedPlayer.id) {
        return updatedPlayer;
      }
      return prevMyPlayer;
    });
  }, []); // 依赖数组为空，函数引用永远稳定

  // 获取玩家列表
  const fetchPlayers = useCallback(async (pageNum: number, isLoadMore = false) => {
    try {
      if (isLoadMore) setIsFetchingMorePlayers(true);
      const response = await publicApi.getPlayers(pageNum, 20);

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
    }
  }, []);

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
      console.error('Failed to fetch crops:', err);
    }
  }, []);

  // 获取日志逻辑
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
      console.error('Failed to fetch logs:', err);
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

  // 获取“我”的信息
  const fetchMe = useCallback(async () => {
    if (typeof window !== 'undefined' && localStorage.getItem('player_key')) {
      try {
        const me = await getMe();
        setMyPlayer(me);
      } catch (e) {
        console.error("Failed to fetch my info (invalid key?)", e);
      }
    }
  }, []);

  const refreshLogs = useCallback(() => {
    setLogPage(1);
    fetchLogs(1);
  }, [fetchLogs]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchPlayers(1),
        fetchCrops(),
        fetchLogs(1),
        fetchMe()
      ]);
      setIsLoading(false);
    };
    init();
  }, [fetchPlayers, fetchCrops, fetchLogs, fetchMe]);

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

    updatePlayer,
    fetchMe,

    error,
    isConnected,
    refresh: () => {
      setPlayerPage(1);
      setLogPage(1);
      fetchPlayers(1);
      fetchLogs(1);
      fetchMe();
    },
  };
}