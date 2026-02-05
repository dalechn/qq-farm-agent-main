"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { 
  Activity,
  Loader2,
  Skull,
  Globe,
  User
} from "lucide-react";
import { useGame } from "@/context/GameContext"; 
import { type Player, type ActionLog, publicApi } from "@/lib/api";
import { ActivityList } from "@/components/ActivityList";
import { Leaderboard } from "@/components/Leaderboard";
import { FarmViewport } from "@/components/FarmViewport";
import { LogSidebar } from "@/components/LogSidebar"; 

interface FarmDashboardProps {
  initialUsername?: string;
}

export function FarmDashboard({ initialUsername }: FarmDashboardProps) {
  const router = useRouter();
  
  const { 
    players, 
    logs: globalLogs, 
    isLoading, 
    isFetchingMorePlayers,
    hasMorePlayers,
    loadMorePlayers,
    hasMoreLogs,
    loadMoreLogs,
    isFetchingMoreLogs,
    error,
    isActivityOpen,
    setIsActivityOpen
  } = useGame();
  
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [isPlayerLoading, setIsPlayerLoading] = useState(false);

  // 日志 Tab 状态
  const [activeLogTab, setActiveLogTab] = useState<'global' | 'agent'>('global');
  const [agentLogs, setAgentLogs] = useState<ActionLog[]>([]);
  const [isAgentLogsLoading, setIsAgentLogsLoading] = useState(false);

  // 处理初始用户
  useEffect(() => {
    if (initialUsername) {
      setIsPlayerLoading(true);
      publicApi.getPlayerByName(initialUsername)
        .then((player) => {
          setSelectedPlayer(player);
        })
        .catch(() => {
          console.error(`User ${initialUsername} not found`);
        })
        .finally(() => setIsPlayerLoading(false));
    }
  }, [initialUsername]);

  // 默认选中
  useEffect(() => {
    if (!initialUsername && !selectedPlayer && players.length > 0) {
      setSelectedPlayer(players[0]);
    }
  }, [players, selectedPlayer, initialUsername]);

  // 获取 Agent 日志
  useEffect(() => {
    if (activeLogTab === 'agent' && selectedPlayer) {
      setIsAgentLogsLoading(true);
      publicApi.getLogs(selectedPlayer.id)
        .then(response => setAgentLogs(response.data)) 
        .catch(err => console.error("Failed to fetch agent logs", err))
        .finally(() => setIsAgentLogsLoading(false));
    }
  }, [activeLogTab, selectedPlayer]);

  // [删除] 原来的 IntersectionObserver 自动加载 useEffect 已经移除

  // 切换玩家
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

  // 这里的 logs 是已经格式化好的 ActionLog 或者是原始数据
  // 注意：ActivityList 现在接收原始的 ActionLog 类型更方便，或者你保持 format 逻辑
  // 为了配合新的 ActivityList，这里直接使用原始 logs 即可，渲染逻辑已移入 ActivityList
  const currentLogs = activeLogTab === 'global' ? globalLogs : agentLogs;

  if (isLoading && !selectedPlayer && players.length === 0) {
    return (
      <div className="h-full w-full bg-[#1c1917] flex items-center justify-center text-stone-200 font-mono">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-stone-500 uppercase tracking-widest">INITIALIZING SYSTEM...</p>
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

      {/* 1. 左侧：排行榜 */}
      <Leaderboard 
        players={players}
        selectedPlayer={selectedPlayer}
        onPlayerSelect={handlePlayerClick}
        isFetchingMore={isFetchingMorePlayers}
        hasMore={hasMorePlayers}
        onLoadMore={loadMorePlayers}
        isHiddenOnMobile={!!initialUsername}
      />

      {/* 2. 中间：农场详情 */}
      <FarmViewport 
        selectedPlayer={selectedPlayer}
        isSearching={false}
        isPlayerLoading={isPlayerLoading}
        showOnMobile={!!initialUsername}
      />

      {/* 3. 右侧：PC 端日志面板 */}
      <div className="hidden lg:flex lg:w-80 flex-none border-l-2 border-stone-700 flex-col bg-stone-900 h-full">
        <div className="flex-none h-10 border-b-2 border-stone-700 bg-stone-800 flex items-center justify-between px-2 gap-2 select-none">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-stone-400" />
              <h2 className="font-bold text-xs text-stone-300 uppercase tracking-widest font-mono hidden xl:block">SYSTEM LOG</h2>
            </div>
            
            <div className="flex bg-stone-950 p-0.5 rounded-sm">
              <button 
                onClick={() => setActiveLogTab('global')}
                className={`px-2 py-0.5 text-[10px] font-bold font-mono transition-colors flex items-center gap-1 ${activeLogTab === 'global' ? 'bg-stone-700 text-white shadow-sm' : 'text-stone-500 hover:text-stone-300'}`}
              >
                <Globe className="w-3 h-3" /> ALL
              </button>
              <button 
                onClick={() => setActiveLogTab('agent')}
                className={`px-2 py-0.5 text-[10px] font-bold font-mono transition-colors flex items-center gap-1 ${activeLogTab === 'agent' ? 'bg-orange-900/50 text-orange-200 border border-orange-500/30' : 'text-stone-500 hover:text-stone-300'}`}
              >
                <User className="w-3 h-3" /> AGENT
              </button>
            </div>
        </div>

        {/* 虚拟滚动容器 */}
        <div className="flex-1 min-h-0 bg-stone-900/50 relative">
            {isAgentLogsLoading && activeLogTab === 'agent' && (
              <div className="absolute inset-0 bg-stone-900/80 flex items-center justify-center z-10">
                <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
              </div>
            )}
            
            {activeLogTab === 'agent' && !selectedPlayer ? (
              <div className="flex flex-col items-center justify-center h-full text-stone-600 text-xs font-mono p-4 text-center">
                <User className="w-8 h-8 mb-2 opacity-20" />
                SELECT AGENT TO VIEW LOGS
              </div>
            ) : (
              <ActivityList 
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
        isLoading={isAgentLogsLoading}
        onPlayerClick={handleLogPlayerClick}
        hasMore={activeLogTab === 'global' ? hasMoreLogs : false}
        onLoadMore={loadMoreLogs}
        isLoadingMore={isFetchingMoreLogs}
      />
    </>
  );
}