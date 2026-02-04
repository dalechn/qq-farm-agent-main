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
  // [新增] 存储服务器返回的真实总数
  const [totalCount, setTotalCount] = useState(0);

  // 获取玩家列表 (初始加载 或 加载更多)
  const fetchPlayers = useCallback(async (pageNum: number, isLoadMore = false) => {
    try {
      if (isLoadMore) setIsFetchingMore(true);
      
      const response = await publicApi.getPlayers(pageNum, 20); // 每页 20 条
      
      if (isLoadMore) {
        // 过滤掉可能重复的 ID (React key duplicate fix)
        setPlayers(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newPlayers = response.data.filter(p => !existingIds.has(p.id));
            return [...prev, ...newPlayers];
        });
      } else {
        setPlayers(response.data);
      }
      
      // [新增] 更新总数和分页状态
      setTotalCount(response.pagination.total);
      setHasMore(response.pagination.hasMore);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsFetchingMore(false);
    }
  }, []);

  // 加载下一页的函数
  const loadMorePlayers = useCallback(() => {
    if (!hasMore || isFetchingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPlayers(nextPage, true);
  }, [page, hasMore, isFetchingMore, fetchPlayers]);

  // 获取作物列表
  const fetchCrops = useCallback(async () => {
    try {
      const data = await publicApi.getCrops();
      setCrops(data);
    } catch (err: any) {
      console.error('Failed to fetch crops:', err);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchPlayers(1), fetchCrops()]);
      setIsLoading(false);
    };
    init();
  }, [fetchPlayers, fetchCrops]);

  // WebSocket 消息处理
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    // ... (WebSocket 逻辑保持不变)
    switch (message.type) {
      case 'action':
        setLogs((prev) => [
          {
            type: message.type,
            action: message.action,
            playerId: message.playerId,
            playerName: message.playerName,
            details: message.details,
            timestamp: message.timestamp,
          },
          ...prev.slice(0, 49),
        ]);
        break;
      case 'player_joined':
         // 有新玩家加入时，总数 + 1
         setTotalCount(prev => prev + 1);
         break;
      default:
        break;
    }
  }, []);

  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
  });

  // 统计数据
  const stats = {
    // [修改] 显示真实总数，而不是 loaded count
    totalPlayers: totalCount, 
    loadedCount: players.length, // 可选：用于调试
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
    refresh: () => { setPage(1); fetchPlayers(1); },
    loadMorePlayers,
  };
}