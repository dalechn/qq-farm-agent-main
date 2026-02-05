"use client";

import { useEffect, useState, useMemo, useRef } from "react";
// [修改] 引入 useParams
import { useRouter, useParams } from "next/navigation";
import { 
  Activity,
  Loader2,
  Skull,
  Globe,
  User
} from "lucide-react";
import { useGameData } from "@/hooks/useGameData";
import { type Player, type ActionLog, publicApi } from "@/lib/api";
import { ActivityList } from "@/components/ActivityList";
import { ShopModal } from "@/components/ShopModal"; 
import { LogSidebar } from "@/components/LogSidebar";
import { GameHeader } from "@/components/GameHeader";
import { Leaderboard } from "@/components/Leaderboard";
import { FarmViewport } from "@/components/FarmViewport";

// [修改] 移除 initialUsername 属性，现在是自包含的
export function FarmDashboard() {
  const router = useRouter();
  // [新增] 直接从 URL 获取参数
  const params = useParams();
  const urlUsername = params?.username ? decodeURIComponent(params.username as string) : undefined;

  const { 
    players, 
    crops, 
    logs: globalLogs, 
    stats, 
    isLoading, 
    isFetchingMore,
    hasMore,
    loadMorePlayers,
    error, 
    isConnected, 
    refresh 
  } = useGameData();
  
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  
  // UI 状态
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [isPlayerLoading, setIsPlayerLoading] = useState(false);

  // 日志 Tab 状态
  const [activeLogTab, setActiveLogTab] = useState<'global' | 'agent'>('global');
  const [agentLogs, setAgentLogs] = useState<ActionLog[]>([]);
  const [isAgentLogsLoading, setIsAgentLogsLoading] = useState(false);

  // 处理初始用户 (响应 URL 变化)
  useEffect(() => {
    if (urlUsername) {
      setIsSearching(true);
      publicApi.getPlayerByName(urlUsername)
        .then((player) => {
          setSelectedPlayer(player);
        })
        .catch(() => {
          console.error(`User ${urlUsername} not found`);
        })
        .finally(() => setIsSearching(false));
    }
  }, [urlUsername]); // [修改] 依赖项改为 urlUsername

  // 默认选中逻辑
  useEffect(() => {
    if (!urlUsername && !selectedPlayer && players.length > 0) {
      setSelectedPlayer(players[0]);
    }
  }, [players, selectedPlayer, urlUsername]);

  // 当切换到 Agent Tab 且选中玩家变化时，获取该玩家的日志
  useEffect(() => {
    if (activeLogTab === 'agent' && selectedPlayer) {
      setIsAgentLogsLoading(true);
      publicApi.getLogs(selectedPlayer.id)
        .then(logs => setAgentLogs(logs))
        .catch(err => console.error("Failed to fetch agent logs", err))
        .finally(() => setIsAgentLogsLoading(false));
    }
  }, [activeLogTab, selectedPlayer]);

  // 切换玩家逻辑
  const switchPlayer = async (name: string) => {
    if (window.innerWidth < 1024) {
      router.push(`/u/${name}`);
    } else {
      setIsPlayerLoading(true);
      window.history.pushState(null, '', `/u/${name}`);
      try {
        const freshData = await publicApi.getPlayerByName(name);
        setSelectedPlayer(freshData);
      } catch (e) {
        console.error("Failed to refresh player data", e);
        alert("Agent not found or offline.");
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    switchPlayer(searchQuery.trim());
  };

  const handleLogPlayerClick = (name: string) => {
    switchPlayer(name);
  };

  // 格式化日志
  const formatLogs = (rawLogs: ActionLog[], suffix: string) => {
    return rawLogs.map((log, index) => ({
      id: log.id || `${log.timestamp}-${index}-${suffix}`,
      time: new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      player: log.playerName,
      action: log.action,
      details: log.details,
    }));
  };

  const formattedGlobalLogs = useMemo(() => formatLogs(globalLogs, 'global'), [globalLogs]);
  const formattedAgentLogs = useMemo(() => formatLogs(agentLogs, 'agent'), [agentLogs]);

  const currentLogs = activeLogTab === 'global' ? formattedGlobalLogs : formattedAgentLogs;

  if (isLoading && !selectedPlayer && players.length === 0) {
    return (
      <div className="h-screen w-full bg-stone-900 flex items-center justify-center text-stone-200 font-mono">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-stone-500 uppercase tracking-widest">INITIALIZING SYSTEM...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#1c1917] text-stone-200 font-sans flex flex-col overflow-hidden selection:bg-orange-500/30">
      
      {/* Header */}
      <GameHeader 
        stats={stats}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearch={handleSearch}
        isConnected={isConnected}
        onOpenShop={() => setIsShopOpen(true)}
        onOpenActivity={() => setIsActivityOpen(true)}
      />

      {error && (
        <div className="flex-none bg-red-900/90 border-b-2 border-red-600 px-4 py-1 z-40 relative">
          <div className="text-white text-xs flex items-center gap-2 font-mono font-bold">
            <Skull className="w-3 h-3" />
            ERROR: {error}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-hidden relative flex flex-col lg:flex-row bg-[#1c1917]">
        
          {/* 1. 左侧：排行榜 */}
          <Leaderboard 
            players={players}
            selectedPlayer={selectedPlayer}
            onPlayerSelect={handlePlayerClick}
            isFetchingMore={isFetchingMore}
            hasMore={hasMore}
            onLoadMore={loadMorePlayers}
            isHiddenOnMobile={!!urlUsername} // [修改] 使用 urlUsername 判断
          />

          {/* 2. 中间：农场详情 (Viewport) */}
          <FarmViewport 
            selectedPlayer={selectedPlayer}
            isSearching={isSearching}
            isPlayerLoading={isPlayerLoading}
            showOnMobile={!!urlUsername} // [修改] 使用 urlUsername 判断
          />

          {/* 3. 右侧：PC 端日志面板 */}
          <div className="hidden lg:flex lg:w-80 flex-none border-l-2 border-stone-700 flex-col bg-stone-900 h-full">
            <div className="flex-none h-10 border-b-2 border-stone-700 bg-stone-800 flex items-center justify-between px-2 gap-2 select-none">
               <div className="flex items-center gap-2">
                 <Activity className="w-4 h-4 text-stone-400" />
                 <h2 className="font-bold text-xs text-stone-300 uppercase tracking-widest font-mono hidden xl:block">SYSTEM LOG</h2>
               </div>
               
               {/* Tab Switcher */}
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

            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 bg-stone-900/50 relative">
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
                 <ActivityList logs={currentLogs} onPlayerClick={handleLogPlayerClick} />
               )}
            </div>
          </div>

      </main>

      {/* ================= Modals ================= */}
      <ShopModal 
        isOpen={isShopOpen} 
        onClose={() => setIsShopOpen(false)} 
        crops={crops} 
      />

      {/* [修改] 传递 Tab 状态和当前日志给侧边栏 */}
      <LogSidebar 
        isOpen={isActivityOpen} 
        onClose={() => setIsActivityOpen(false)} 
        logs={currentLogs} // 传递动态日志
        activeTab={activeLogTab}
        onTabChange={setActiveLogTab}
        isLoading={isAgentLogsLoading}
        onPlayerClick={handleLogPlayerClick} 
      />

    </div>
  );
}