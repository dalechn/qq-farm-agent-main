/**
 * Game Data Hook
 * 管理游戏数据的获取和更新
 */

import { useState, useEffect, useCallback } from 'react';
import { publicApi, Player, Crop, ActionLog } from '@/lib/api';
import { useWebSocket, WebSocketMessage } from './useWebSocket';

interface UseGameDataOptions {
  refreshInterval?: number;
}

export function useGameData(options: UseGameDataOptions = {}) {
  const { refreshInterval = 5000 } = options;

  const [players, setPlayers] = useState<Player[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 获取玩家列表
  const fetchPlayers = useCallback(async () => {
    try {
      const data = await publicApi.getPlayers();
      setPlayers(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

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
      await Promise.all([fetchPlayers(), fetchCrops()]);
      setIsLoading(false);
    };
    init();
  }, [fetchPlayers, fetchCrops]);

  // 定时刷新
  useEffect(() => {
    const interval = setInterval(fetchPlayers, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchPlayers, refreshInterval]);

  // WebSocket 消息处理
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    console.log('📨 WebSocket message:', message);

    switch (message.type) {
      case 'action':
        // 添加到日志
        setLogs((prev) => [
          {
            type: message.type,
            action: message.action,
            playerId: message.playerId,
            playerName: message.playerName,
            details: message.details,
            timestamp: message.timestamp,
          },
          ...prev.slice(0, 49), // 保留最近 50 条
        ]);
        // 刷新玩家数据
        fetchPlayers();
        break;

      case 'player_joined':
        // 新玩家加入
        fetchPlayers();
        setLogs((prev) => [
          {
            type: 'action',
            action: 'JOIN',
            playerId: message.player.id,
            playerName: message.player.name,
            details: '加入游戏',
            timestamp: new Date().toISOString(),
          },
          ...prev.slice(0, 49),
        ]);
        break;

      case 'crop_mature':
        // 作物成熟
        fetchPlayers();
        break;

      case 'crop_stolen':
        // 作物被偷
        fetchPlayers();
        break;

      default:
        break;
    }
  }, [fetchPlayers]);

  // 使用 WebSocket（使用一个公共连接用于监听广播）
  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
  });

  // 计算统计数据
  const stats = {
    totalPlayers: players.length,
    totalGold: players.reduce((sum, p) => sum + p.gold, 0),
    totalExp: players.reduce((sum, p) => sum + p.exp, 0),
    harvestableCount: players.reduce(
      (sum, p) => sum + p.lands.filter((l) => l.status === 'harvestable').length,
      0
    ),
    plantedCount: players.reduce(
      (sum, p) => sum + p.lands.filter((l) => l.status === 'planted').length,
      0
    ),
  };

  return {
    players,
    crops,
    logs,
    stats,
    isLoading,
    error,
    isConnected,
    refresh: fetchPlayers,
  };
}
