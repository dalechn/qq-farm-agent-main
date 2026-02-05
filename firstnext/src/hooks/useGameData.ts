//
import { useState, useEffect, useCallback, useRef } from 'react';
import { publicApi, Player, Crop, ActionLog } from '@/lib/api';
import { useWebSocket, WebSocketMessage } from './useWebSocket';

interface UseGameDataOptions {
  refreshInterval?: number;
}

export function useGameData(options: UseGameDataOptions = {}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { refreshInterval = 5000 } = options;

  const [players, setPlayers] = useState<Player[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 分页状态
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // 获取玩家列表
  const fetchPlayers = useCallback(async (pageNum: number, isLoadMore = false) => {
    try {
      if (isLoadMore) setIsFetchingMore(true);
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
      
      setTotalCount(response.pagination.total);
      setHasMore(response.pagination.hasMore);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsFetchingMore(false);
    }
  }, []);

  const loadMorePlayers = useCallback(() => {
    if (!hasMore || isFetchingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPlayers(nextPage, true);
  }, [page, hasMore, isFetchingMore, fetchPlayers]);

  const fetchCrops = useCallback(async () => {
    try {
      const data = await publicApi.getCrops();
      setCrops(data);
    } catch (err: any) {
      console.error('Failed to fetch crops:', err);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const historyLogs = await publicApi.getLogs();
      // 后端返回的 logs 已经包含 id
      setLogs(historyLogs);
    } catch (err: any) {
      console.error('Failed to fetch logs:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchPlayers(1), fetchCrops(), fetchLogs()]);
      setIsLoading(false);
    };
    init();
  }, [fetchPlayers, fetchCrops, fetchLogs]);

  // WebSocket 消息处理
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'action':
        setLogs((prev) => [
          {
            // [修改] 显式透传 message 中的所有字段，包含 id
            id: (message as any).id, 
            type: message.type,
            action: message.action,
            playerId: message.playerId,
            playerName: message.playerName,
            details: message.details,
            timestamp: message.timestamp,
          },
          ...prev.slice(0, 99),
        ]);
        break;
      case 'player_joined':
         setTotalCount(prev => prev + 1);
         break;
      default:
        break;
    }
  }, []);

  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
  });

  const stats = {
    totalPlayers: totalCount, 
    loadedCount: players.length,
    totalGold: players.reduce((sum, p) => sum + p.gold, 0),
    totalExp: players.reduce((sum, p) => sum + p.exp, 0),
    harvestableCount: players.reduce(
      (sum, p) => sum + p.lands.filter((l) => l.status === 'harvestable').length,
      0
    ),
  };

  return {
    players,
    crops,
    logs,
    stats,
    isLoading,
    isFetchingMore,
    hasMore,
    error,
    isConnected,
    refresh: () => { setPage(1); fetchPlayers(1); fetchLogs(); },
    loadMorePlayers,
  };
}