"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { type VirtuosoHandle } from "react-virtuoso";
import {
  Activity,
  Loader2,
  Skull,
  Globe,
  User,
  RotateCw
} from "lucide-react";
import { useGame } from "@/context/GameContext";
import { type Player, type ActionLog, publicApi } from "@/lib/api";
import { ActivityList } from "@/components/ActivityList";
import { Leaderboard } from "@/components/list/Leaderboard";
import { FarmViewport } from "@/components/FarmViewport";
import { LogSidebar } from "@/components/LogSidebar";
import { useI18n } from "@/lib/i18n";

interface FarmDashboardProps {
  initialUserId?: string; // [修改] 接收 ID
}

export function FarmDashboard({ initialUserId }: FarmDashboardProps) {
  const router = useRouter();
  const { t } = useI18n();

  // PC 端列表 Ref
  const desktopListRef = useRef<VirtuosoHandle>(null);

  const {
    players,
    logs: globalLogs,
    isLoading,
    isFetchingMorePlayers,
    hasMorePlayers,
    loadMorePlayers,
    hasMoreLogs,
    loadMoreLogs,
    refreshLogs,
    isFetchingMoreLogs,
    error,
    isActivityOpen,
    setIsActivityOpen,
    stats,
    updatePlayer,
    // [新增] 获取排序状态
    sortBy,

    setSortBy,
    // [新增] 刷新
    refreshPlayers,
    isRefreshingPlayers
  } = useGame();

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [isPlayerLoading, setIsPlayerLoading] = useState(false);
  const [activeLogTab, setActiveLogTab] = useState<'global' | 'agent'>('global');
  const [agentLogs, setAgentLogs] = useState<ActionLog[]>([]);
  const [isAgentLogsLoading, setIsAgentLogsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // [新增] 404 状态
  const [notFound, setNotFound] = useState(false);

  /* New State */
  const [isPlayerRefreshing, setIsPlayerRefreshing] = useState(false);
  const [isLeaderboardRefreshing, setIsLeaderboardRefreshing] = useState(false);

  // [新增 1] 创建一个 Ref 来始终追踪最新的 selectedPlayer ID
  // Ref 的值变更是同步的，且不会受闭包影响
  const selectedPlayerIdRef = useRef<string | undefined>(undefined);

  // [新增 2] 每当 selectedPlayer 变化时，同步更新 Ref
  useEffect(() => {
    selectedPlayerIdRef.current = selectedPlayer?.id;
  }, [selectedPlayer?.id]);

  // [修改] 内部刷新函数
  const refreshSelectedPlayerInternal = useCallback(async () => {
    if (!selectedPlayer) return;

    try {
      setNotFound(false); // 重置 404
      const freshData = await publicApi.getPlayerById(selectedPlayer.id); // Change to ID
      setSelectedPlayer(freshData);
      updatePlayer(freshData);
    } catch (e) {
      console.warn("Failed to refresh player:", e);
      // 这里刷新失败一般不置为 404，可能是网络问题，除非明确 404
    }
  }, [selectedPlayer, updatePlayer]);

  // 手动刷新 (带动画)
  const handleManualRefresh = async () => {
    setIsPlayerRefreshing(true);
    // 最小动画时间 500ms
    const minDelay = new Promise(resolve => setTimeout(resolve, 300));

    try {
      await refreshSelectedPlayerInternal();
    } catch (e) {
      console.warn("Manual refresh failed", e);
    }

    await minDelay;
    setIsPlayerRefreshing(false);
  };

  // 自动刷新 (无法动)
  const handleBackgroundRefresh = async () => {
    // 如果没有选人，或者 Ref 里没 ID，直接不跑
    if (!selectedPlayer || !selectedPlayerIdRef.current) return;

    // 保存发起请求时的 ID，用于双重校验（可选，但用 Ref 校验已足够）
    const currentRequestId = selectedPlayer.id;

    try {
      const freshData = await publicApi.getLitePlayer(currentRequestId);

      // [关键校验]：数据回来时，检查当前选中的人是不是还是这个人
      if (freshData.id !== selectedPlayerIdRef.current) {
        // console.log(`Discarded stale background update for ${freshData.id}`);
        return; // 如果 ID 对不上，说明用户已经切走了，丢弃这次更新
      }

      // 手动合并社交属性
      const mergedPlayer = {
        ...freshData,
        avatar: selectedPlayer.avatar || freshData.avatar,
        twitter: selectedPlayer.twitter || freshData.twitter,
        createdAt: selectedPlayer.createdAt || freshData.createdAt,
        _count: selectedPlayer._count || freshData._count
      };

      setSelectedPlayer(mergedPlayer);
      updatePlayer(mergedPlayer);
    } catch (e) {
      // silent fail
    }
  };

  // [修改] 初始化用户 (使用 ID)
  useEffect(() => {
    if (initialUserId) {
      setIsPlayerLoading(true);
      setNotFound(false); // 重置
      publicApi.getPlayerById(initialUserId) // Change to ID
        .then((player) => {
          setSelectedPlayer(player);
          updatePlayer(player);
        })
        .catch((err) => {
          console.warn(`User ${initialUserId} not found`, err);
          // 简单判断一下 error，如果 api 返回 404
          setNotFound(true);
        })
        .finally(() => setIsPlayerLoading(false));
    }
  }, [initialUserId, updatePlayer]);

  // [新增] 1s 轮询逻辑
  useEffect(() => {
    if (!selectedPlayer) return;

    const timer = setInterval(() => {
      handleBackgroundRefresh();
    }, 1000);

    return () => clearInterval(timer);
  }, [selectedPlayer, refreshSelectedPlayerInternal]);




  // 默认选中第一个
  useEffect(() => {
    if (!initialUserId && !selectedPlayer && players.length > 0) {
      setSelectedPlayer(players[0]);
    }
  }, [players, selectedPlayer, initialUserId]);

  // Agent 日志
  const fetchAgentLogs = (playerId: string) => {
    setIsAgentLogsLoading(true);
    publicApi.getLogs(playerId, 1, 50)
      .then(response => setAgentLogs(response.data))
      .catch(err => console.warn("Failed to fetch agent logs", err))
      .finally(() => setIsAgentLogsLoading(false));
  };

  // [新增] 1s 日志轮询
  // useEffect(() => {
  //   // 自动刷新日志
  //   const timer = setInterval(() => {
  //     if (activeLogTab === 'global') {
  //       refreshLogs();
  //     } else if (activeLogTab === 'agent' && selectedPlayer) {
  //       publicApi.getLogs(selectedPlayer.id, 1, 50).then(res => {
  //         if (res?.data) {
  //           setAgentLogs(res.data);
  //         }
  //       }).catch(err => {
  //         console.warn("Background agent logs refresh failed", err);
  //       });
  //     }
  //   }, 1000);

  //   return () => clearInterval(timer);
  // }, [activeLogTab, selectedPlayer, refreshLogs]);


  useEffect(() => {
    if (activeLogTab === 'agent' && selectedPlayer) {
      fetchAgentLogs(selectedPlayer.id);
    }
  }, [activeLogTab, selectedPlayer?.id]);

  // 全局刷新逻辑 (右侧日志栏的刷新按钮)
  const handleRefreshLogs = async () => {
    setIsRefreshing(true);

    // 瞬间跳转到顶部
    desktopListRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'auto' });

    try {
      // 1. 刷新日志
      if (activeLogTab === 'global') {
        refreshLogs();
      } else if (activeLogTab === 'agent' && selectedPlayer) {
        await publicApi.getLogs(selectedPlayer.id).then(res => setAgentLogs(res.data));
      }

      // 2. [新增] 顺便也刷新一下当前玩家状态
      await refreshSelectedPlayerInternal();

    } catch (e) {
      console.warn("Refresh failed", e);
    }

    // 给个最小延迟让动画显示一会
    await new Promise(resolve => setTimeout(resolve, 300));
    setIsRefreshing(false);
  };

  // [修改] 切换玩家逻辑 (使用 ID)
  const switchPlayer = async (id: string) => {
    if (window.innerWidth < 1024) {
      router.push(`/u/${id}`);
      setIsActivityOpen(false);
    } else {
      setIsPlayerLoading(true);
      window.history.pushState(null, '', `/u/${id}`);

      try {
        setNotFound(false);

        // 注意：handlePlayerClick 里的乐观更新已经把 selectedPlayerIdRef.current 更新为目标 ID 了
        // 所以我们在这里请求数据
        const freshData = await publicApi.getPlayerById(id);

        // [关键校验]：请求回来后，再次确认用户当前选中的 ID 依然是这个 ID
        // 防止用户点了 B（开始请求），马上又点了 C。等 B 回来时，Ref 已经是 C 了，B 就会被丢弃。
        if (freshData.id !== selectedPlayerIdRef.current) {
          return;
        }

        setSelectedPlayer(freshData);
        updatePlayer(freshData);
      } catch (e) {
        console.warn("Failed to refresh player data", e);
      } finally {
        // [优化] 只有当 ID 匹配时才关闭 loading，或者简单粗暴关闭也行，
        // 但为了防止覆盖 Loading 状态，最好也判断一下，不过通常这里的副作用较小
        if (id === selectedPlayerIdRef.current) {
          setIsPlayerLoading(false);
        }
      }
    }
  };

  const handlePlayerClick = (player: Player) => {
    if (window.innerWidth >= 1024) {
      setSelectedPlayer(player);
    }
    // 传递 ID
    switchPlayer(player.id);
  };

  // [修改] 接收 ID
  const handleLogPlayerClick = (id: string) => {
    switchPlayer(id);
  };

  const handleLeaderboardRefresh = async () => {
    setIsLeaderboardRefreshing(true);
    const minDelay = new Promise(resolve => setTimeout(resolve, 300));

    try {
      if (refreshPlayers) {
        await refreshPlayers();
      }
    } catch (e) {
      console.warn("Leaderboard refresh failed", e);
    }

    await minDelay;
    setIsLeaderboardRefreshing(false);
  };

  const currentLogs = activeLogTab === 'global'
    ? globalLogs.filter((log: ActionLog) => ['PLANT', 'HARVEST', 'STEAL', 'HELPED', 'SHOVEL', 'CARE'].includes(log.action))
    : agentLogs;
  const isCurrentLogLoading = activeLogTab === 'global' ? false : isAgentLogsLoading;

  if (isLoading && !selectedPlayer && players.length === 0) {
    return (
      <div className="h-full w-full bg-[#1c1917] flex items-center justify-center text-stone-200 font-mono">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-stone-500 uppercase tracking-widest">{t('dashboard.initializing')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="flex-none bg-red-900/90 border-b-2 border-red-600 px-4 py-1 z-40 relative">
          <div className="text-white text-xs flex items-center gap-2 font-mono font-bold">
            <Skull className="w-3 h-3" />
            ERROR: {error}
          </div>
        </div>
      )}

      {/* 1. 排行榜 */}
      <Leaderboard
        players={players}
        selectedPlayer={selectedPlayer}
        onPlayerSelect={handlePlayerClick}
        isFetchingMore={isFetchingMorePlayers}
        hasMore={hasMorePlayers}
        onLoadMore={loadMorePlayers}
        stats={stats}
        isHiddenOnMobile={!!initialUserId} // Check ID existence
        sortBy={sortBy}       // [新增]

        onSortChange={setSortBy} // [新增]
        onRefresh={handleLeaderboardRefresh} // [修改] 使用带延迟的刷新
        isRefreshing={isLeaderboardRefreshing || isRefreshingPlayers} // [修改] 结合本地状态和全局状态
      />

      {/* 2. 视口 */}
      <FarmViewport
        selectedPlayer={selectedPlayer}
        isSearching={false}
        isPlayerLoading={isPlayerLoading}
        showOnMobile={!!initialUserId}
        onRefresh={handleManualRefresh} // [修改] 传入手动刷新
        isRefreshing={isPlayerRefreshing} // [New] Pass refresh state
        notFound={notFound} // [新增]
        onLiteRefresh={handleBackgroundRefresh} // [新增] 将轻量级刷新函数传下去
      />

      {/* 3. PC 端日志面板 */}
      <div className="hidden lg:flex lg:w-80 flex-none border-l-2 border-stone-700 flex-col bg-stone-900 h-full">
        <div className="flex-none h-10 border-b-2 border-stone-700 bg-stone-800 flex items-center justify-between px-2 gap-2 select-none">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-stone-400" />
            <h2 className="font-bold text-xs text-stone-300 uppercase tracking-widest font-mono hidden xl:block">{t('dashboard.systemLog')}</h2>

            <button
              onClick={handleRefreshLogs}
              disabled={isRefreshing}
              className="p-1 hover:bg-stone-700 rounded transition-colors text-stone-500 hover:text-white"
              title={t('dashboard.refreshLogs')}
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-orange-400' : ''}`} />
            </button>
          </div>

          <div className="flex bg-stone-950 p-0.5 rounded-sm">
            <button
              onClick={() => setActiveLogTab('global')}
              className={`px-2 py-0.5 text-[10px] font-bold font-mono transition-colors flex items-center gap-1 ${activeLogTab === 'global' ? 'bg-stone-700 text-white shadow-sm' : 'text-stone-500 hover:text-stone-300'}`}
            >
              <Globe className="w-3 h-3" /> {t('dashboard.all')}
            </button>
            <button
              onClick={() => setActiveLogTab('agent')}
              className={`px-2 py-0.5 text-[10px] font-bold font-mono transition-colors flex items-center gap-1 ${activeLogTab === 'agent' ? 'bg-orange-900/50 text-orange-200 border border-orange-500/30' : 'text-stone-500 hover:text-stone-300'}`}
            >
              <User className="w-3 h-3" /> {t('dashboard.agent')}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-stone-900/50 relative">
          {isCurrentLogLoading && (
            <div className="absolute inset-0 bg-stone-900/80 flex items-center justify-center z-10">
              <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
            </div>
          )}

          {activeLogTab === 'agent' && !selectedPlayer ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-600 text-xs font-mono p-4 text-center">
              <User className="w-8 h-8 mb-2 opacity-20" />
              {t('dashboard.selectAgent')}
            </div>
          ) : (
            <ActivityList
              ref={desktopListRef}
              logs={currentLogs}
              onPlayerClick={handleLogPlayerClick}
              hasMore={activeLogTab === 'global' ? hasMoreLogs : false}
              onLoadMore={loadMoreLogs}
              isLoadingMore={isFetchingMoreLogs}
            />
          )}
        </div>
      </div>

      {/* 4. 移动端侧边栏 */}
      <LogSidebar
        isOpen={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
        logs={currentLogs}
        activeTab={activeLogTab}
        onTabChange={setActiveLogTab}
        isLoading={isCurrentLogLoading}
        onPlayerClick={handleLogPlayerClick}
        hasMore={activeLogTab === 'global' ? hasMoreLogs : false}
        onLoadMore={loadMoreLogs}
        isLoadingMore={isFetchingMoreLogs}
        onRefresh={handleRefreshLogs}
        isRefreshing={isRefreshing}
      />
    </>
  );
}