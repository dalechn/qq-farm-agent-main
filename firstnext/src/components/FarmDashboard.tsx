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
import { Leaderboard } from "@/components/Leaderboard";
import { FarmViewport } from "@/components/FarmViewport";
import { LogSidebar } from "@/components/LogSidebar";
import { useI18n } from "@/lib/i18n";

interface FarmDashboardProps {
  initialUsername?: string;
}

export function FarmDashboard({ initialUsername }: FarmDashboardProps) {
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
    updatePlayer
  } = useGame();

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [isPlayerLoading, setIsPlayerLoading] = useState(false);
  const [activeLogTab, setActiveLogTab] = useState<'global' | 'agent'>('global');
  const [agentLogs, setAgentLogs] = useState<ActionLog[]>([]);
  const [isAgentLogsLoading, setIsAgentLogsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // [新增] 核心：刷新当前选中玩家的数据
  const refreshSelectedPlayer = useCallback(async () => {
    if (!selectedPlayer) return;

    // 不显示全局 loading，只在局部（比如按钮）显示 loading 状态，或者用 isPlayerLoading 控制
    // 这里我们可以复用 isPlayerLoading，但这会让整个视口变灰，体验一般
    // 建议只在后台静默刷新，或者让 FarmViewport 自己处理 loading 态
    // 为了简单，我们这里暂时不设 isPlayerLoading，只更新数据
    try {
      const freshData = await publicApi.getPlayerByName(selectedPlayer.name);
      setSelectedPlayer(freshData);
      updatePlayer(freshData); // 同步更新排行榜里的数据
    } catch (e) {
      console.error("Failed to refresh player:", e);
    }
  }, [selectedPlayer, updatePlayer]);

  // 初始化用户
  useEffect(() => {
    if (initialUsername) {
      setIsPlayerLoading(true);
      publicApi.getPlayerByName(initialUsername)
        .then((player) => {
          setSelectedPlayer(player);
          updatePlayer(player);
        })
        .catch(() => {
          console.error(`User ${initialUsername} not found`);
        })
        .finally(() => setIsPlayerLoading(false));
    }
  }, [initialUsername, updatePlayer]);

  // 默认选中第一个
  useEffect(() => {
    if (!initialUsername && !selectedPlayer && players.length > 0) {
      setSelectedPlayer(players[0]);
    }
  }, [players, selectedPlayer, initialUsername]);

  // Agent 日志
  const fetchAgentLogs = (playerId: string) => {
    setIsAgentLogsLoading(true);
    publicApi.getLogs(playerId)
      .then(response => setAgentLogs(response.data))
      .catch(err => console.error("Failed to fetch agent logs", err))
      .finally(() => setIsAgentLogsLoading(false));
  };

  useEffect(() => {
    if (activeLogTab === 'agent' && selectedPlayer) {
      fetchAgentLogs(selectedPlayer.id);
    }
  }, [activeLogTab, selectedPlayer]);

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
      //   await refreshSelectedPlayer();

    } catch (e) {
      console.error("Refresh failed", e);
    }

    // 给个最小延迟让动画显示一会
    await new Promise(resolve => setTimeout(resolve, 300));
    setIsRefreshing(false);
  };

  const switchPlayer = async (name: string) => {
    if (window.innerWidth < 1024) {
      router.push(`/u/${name}`);
      setIsActivityOpen(false);
    } else {
      setIsPlayerLoading(true);
      window.history.pushState(null, '', `/u/${name}`);
      try {
        const freshData = await publicApi.getPlayerByName(name);
        setSelectedPlayer(freshData);
        updatePlayer(freshData);
      } catch (e) {
        console.error("Failed to refresh player data", e);
      } finally {
        setIsPlayerLoading(false);
      }
    }
  };

  const handlePlayerClick = (player: Player) => {
    if (window.innerWidth >= 1024) {
      setSelectedPlayer(player);
    }
    switchPlayer(player.name);
  };

  const handleLogPlayerClick = (name: string) => {
    switchPlayer(name);
  };

  const currentLogs = activeLogTab === 'global' ? globalLogs : agentLogs;
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
        isHiddenOnMobile={!!initialUsername}
      />

      {/* 2. 视口 */}
      <FarmViewport
        selectedPlayer={selectedPlayer}
        isSearching={false}
        isPlayerLoading={isPlayerLoading}
        showOnMobile={!!initialUsername}
        onRefresh={refreshSelectedPlayer} // [修改] 传入专门的刷新函数
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