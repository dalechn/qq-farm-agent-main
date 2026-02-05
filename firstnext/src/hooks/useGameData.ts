import { useState, useEffect, useCallback } from 'react';
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

  // 玩家列表分页状态
  const [playerPage, setPlayerPage] = useState(1);
  const [hasMorePlayers, setHasMorePlayers] = useState(true);
  const [isFetchingMorePlayers, setIsFetchingMorePlayers] = useState(false);
  const [totalPlayersCount, setTotalPlayersCount] = useState(0);

  // 日志分页状态
  const [logPage, setLogPage] = useState(1);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [isFetchingMoreLogs, setIsFetchingMoreLogs] = useState(false);

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
      setCrops(data);
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

  // [新增] 手动刷新日志方法
  const refreshLogs = useCallback(() => {
    setLogPage(1); // 重置页码
    fetchLogs(1);  // 重新获取第一页
  }, [fetchLogs]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchPlayers(1), fetchCrops(), fetchLogs(1)]);
      setIsLoading(false);
    };
    init();
  }, [fetchPlayers, fetchCrops, fetchLogs]);

  // WebSocket 消息处理
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'action':
        // [修改] 暂时注释掉 WS 日志监听，保留代码结构
        /*
        setLogs((prev) => {
          const msgId = (message as any).id;
          if (msgId && prev.some(l => l.id === msgId)) {
             return prev; 
          }

          return [
            {
              id: msgId, 
              type: message.type,
              action: message.action,
              playerId: message.playerId,
              playerName: message.playerName,
              details: message.details,
              timestamp: message.timestamp,
            },
            ...prev, 
          ];
        });
        */
        break;
      case 'player_joined':
         setTotalPlayersCount(prev => prev + 1);
         break;
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
    
    isFetchingMorePlayers,
    hasMorePlayers,
    loadMorePlayers,

    isFetchingMoreLogs,
    hasMoreLogs,
    loadMoreLogs,
    refreshLogs, // [新增] 导出刷新方法
    
    error,
    isConnected,
    refresh: () => { 
      setPlayerPage(1); 
      setLogPage(1); 
      fetchPlayers(1); 
      fetchLogs(1); 
    },
  };
}