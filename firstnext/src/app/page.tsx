"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { 
  Sprout, 
  Coins, 
  Activity,
  Users,
  Timer,
  CheckCircle2,
  Loader2,
  Wifi,
  WifiOff,
  RefreshCw,
  Skull,
  Trophy,
  Leaf,
  ChevronDown
} from "lucide-react";
import { useGameData } from "@/hooks/useGameData";
import type { Player } from "@/lib/api";
import { LandTile } from "@/components/LandTile";

const CROPS: Record<string, { name: string; emoji: string; color: string }> = {
  radish: { name: "白萝卜", emoji: "🥬", color: "text-green-400" },
  carrot: { name: "胡萝卜", emoji: "🥕", color: "text-orange-400" },
  corn: { name: "玉米", emoji: "🌽", color: "text-yellow-400" },
  strawberry: { name: "草莓", emoji: "🍓", color: "text-pink-400" },
  watermelon: { name: "西瓜", emoji: "🍉", color: "text-red-400" },
};

// 辅助组件
function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-slate-950/50 p-2 rounded border border-slate-800/50 flex flex-col items-center justify-center text-center">
      <div className={`mb-1 ${color}`}>{icon}</div>
      <div className="text-[10px] text-slate-500 uppercase">{label}</div>
      <div className={`font-mono font-bold text-sm ${color}`}>{value}</div>
    </div>
  );
}

function getActionColor(action: string) {
  const map: Record<string, string> = {
    HARVEST: "text-green-400",
    PLANT: "text-blue-400",
    STEAL: "text-red-400",
    JOIN: "text-cyan-400",
  };
  return map[action] || "text-slate-400";
}

export default function Home() {
  const { 
    players, 
    logs, 
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
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // [关键修复] 使用 useState 存储滚动容器 DOM，确保不为 null
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);

  // [关键修复] 使用 Ref 追踪最新状态，避免 Effect 频繁重启
  const stateRef = useRef({ hasMore, isFetchingMore });
  useEffect(() => {
    stateRef.current = { hasMore, isFetchingMore };
  }, [hasMore, isFetchingMore]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // [关键修复] 滚动加载逻辑
  useEffect(() => {
    // 只有当滚动容器准备好后才启动观察器
    if (!scrollContainer) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const { hasMore, isFetchingMore } = stateRef.current;
        // 使用 Ref 中的最新状态判断
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
          console.log("Load more triggered");
          loadMorePlayers();
        }
      },
      { 
        root: scrollContainer, // 精确指定内部滚动容器为 root
        threshold: 0.1,        // 露出 10% 触发
        rootMargin: "200px"    // 提前 200px 预加载
      }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [scrollContainer, loadMorePlayers]); // 仅当容器挂载或加载函数改变时重建

  // 默认选中
  useEffect(() => {
    if (players.length > 0 && !selectedPlayer) {
      setSelectedPlayer(players[0]);
    }
  }, [players, selectedPlayer]);

  const formattedLogs = useMemo(() => {
    return logs.map((log, index) => ({
      id: `${log.timestamp}-${index}`,
      time: new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      player: log.playerName,
      action: log.action,
      details: log.details,
    }));
  }, [logs]);

  if (isLoading) {
    return (
      <div className="h-screen w-full bg-slate-950 flex items-center justify-center text-slate-200">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-mono">Connecting to Farm Control...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-200 font-sans flex flex-col overflow-hidden selection:bg-cyan-500/30">
      
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

      {/* Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex-none flex items-center justify-between px-4 sm:px-6 z-40 relative">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-cyan-500/20 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.5)]">
            <Sprout className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold tracking-tight text-white leading-none">QQ Farm Control</h1>
            <p className="text-[10px] text-cyan-500/80 font-mono mt-0.5">AGENT MONITOR V2.7</p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 text-sm">
          {/* 这里现在显示的是真实的 totalPlayers */}
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded border border-slate-800" title={`Loaded: ${stats.loadedCount}`}>
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono font-bold text-white">{stats.totalPlayers}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded border border-slate-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            <span className="text-slate-400 text-xs hidden sm:inline">Harvestable</span>
            <span className="font-mono font-bold text-green-400">{stats.harvestableCount}</span>
          </div>
          
          <div className="w-px h-6 bg-slate-800 mx-2 hidden sm:block" />
          
          <div className="flex items-center gap-3">
             {isConnected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            
            <span className="font-mono text-slate-400 text-xs sm:text-sm">
              {currentTime.toLocaleTimeString()}
            </span>

            <button onClick={refresh} className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-cyan-400">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="flex-none bg-red-900/20 border-b border-red-900/50 px-6 py-2 z-40 relative">
          <div className="text-red-400 text-xs flex items-center gap-2">
            <Skull className="w-3 h-3" />
            {error}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto lg:overflow-hidden z-10 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-auto lg:h-full">
          
          {/* ================= 左侧：排行榜 ================= */}
          <aside className="lg:col-span-3 flex flex-col bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm shadow-xl h-[500px] lg:h-full min-h-0">
            <div className="flex-none p-4 border-b border-slate-800/50 flex items-center justify-between bg-slate-900/50">
              <h2 className="font-bold text-sm flex items-center gap-2 text-slate-200">
                <Trophy className="w-4 h-4 text-yellow-500" />
                Leaderboard
              </h2>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                TOP GOLD
              </span>
            </div>

            {/* [关键] 将 setScrollContainer 传递给 ref */}
            <div 
              ref={setScrollContainer}
              className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 min-h-0"
            >
              {players.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">No agents</div>
              ) : (
                players.map((player, index) => (
                  <div
                    key={player.id}
                    onClick={() => setSelectedPlayer(player)}
                    className={`
                      group relative p-3 rounded-lg border cursor-pointer transition-all duration-200
                      ${selectedPlayer?.id === player.id 
                        ? "bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]" 
                        : "bg-slate-900/40 border-slate-800/50 hover:bg-slate-800/60 hover:border-slate-700"}
                    `}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold font-mono ${index < 3 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-800 text-slate-500'}`}>
                          {index + 1}
                        </div>
                        <span className={`text-sm font-medium truncate max-w-[100px] ${selectedPlayer?.id === player.id ? 'text-cyan-400' : 'text-slate-300'}`}>
                          {player.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">Lv.{player.level}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                       <span className="text-yellow-500/90 font-mono flex items-center gap-1">
                          <Coins className="w-3 h-3" /> {player.gold.toLocaleString()}
                       </span>
                       {player.lands.some(l => l.status === 'harvestable') && (
                         <div className="flex items-center gap-1 text-green-400 animate-pulse">
                           <CheckCircle2 className="w-3 h-3" />
                           <span className="text-[10px] font-bold">READY</span>
                         </div>
                       )}
                    </div>
                  </div>
                ))
              )}

              {/* 自动加载触发器 + 手动保险按钮 */}
              <div ref={observerTarget} className="py-2 flex flex-col items-center justify-center min-h-[40px]">
                 {isFetchingMore ? (
                   <div className="flex items-center gap-2 text-xs text-slate-500">
                     <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                   </div>
                 ) : hasMore ? (
                   <button 
                     onClick={loadMorePlayers}
                     className="text-xs text-slate-500 hover:text-cyan-400 flex items-center gap-1 transition-colors px-4 py-2 opacity-50 hover:opacity-100"
                   >
                     Load More <ChevronDown className="w-3 h-3" />
                   </button>
                 ) : (
                   <span className="text-[10px] text-slate-600">No more agents</span>
                 )}
              </div>
            </div>
          </aside>

          {/* ================= 中间：农场详情 ================= */}
          <section className="lg:col-span-6 flex flex-col bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm shadow-xl h-[500px] lg:h-full min-h-0">
            {selectedPlayer ? (
              <>
                <div className="flex-none p-5 border-b border-slate-800 bg-gradient-to-r from-cyan-950/30 to-transparent">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-white">{selectedPlayer.name}</h2>
                      <p className="text-xs text-slate-500 font-mono">ID: {selectedPlayer.id}</p>
                    </div>
                    <div className="text-right">
                       <div className="text-2xl font-bold text-cyan-500 font-mono">Lv.{selectedPlayer.level}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                     <div className="bg-slate-950/50 p-2 rounded border border-slate-800/50 flex justify-between items-center">
                        <span className="text-xs text-slate-500">GOLD</span>
                        <span className="text-yellow-400 font-mono font-bold">{selectedPlayer.gold.toLocaleString()}</span>
                     </div>
                     <div className="bg-slate-950/50 p-2 rounded border border-slate-800/50 flex justify-between items-center">
                        <span className="text-xs text-slate-500">EXP</span>
                        <span className="text-purple-400 font-mono font-bold">{selectedPlayer.exp.toLocaleString()}</span>
                     </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <StatCard 
                      label="Empty" 
                      value={selectedPlayer.lands.filter((l) => l.status === "empty").length}
                      icon={<div className="w-2 h-2 rounded-full border border-slate-500" />}
                      color="text-slate-400"
                    />
                    <StatCard 
                      label="Growing" 
                      value={selectedPlayer.lands.filter((l) => l.status === "planted").length}
                      icon={<Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      color="text-blue-400"
                    />
                    <StatCard 
                      label="Ready" 
                      value={selectedPlayer.lands.filter((l) => l.status === "harvestable").length}
                      icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                      color="text-green-400"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-950/30 min-h-0">
                   <div className="flex items-center gap-2 mb-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                     <Leaf className="w-3 h-3" />
                     <span>Farm Grid</span>
                   </div>
                  <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    {selectedPlayer.lands.map((land) => (
                      <LandTile key={land.id} land={land} />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600">
                <Sprout className="w-12 h-12 opacity-20 mb-4" />
                <p>Select an agent to view details</p>
              </div>
            )}
          </section>

          {/* ================= 右侧：Live Activity ================= */}
          <aside className="lg:col-span-3 flex flex-col bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm shadow-xl h-[500px] lg:h-full min-h-0">
             <div className="flex-none p-4 border-b border-slate-800/50 flex items-center justify-between bg-slate-900/50">
              <h2 className="font-bold text-sm flex items-center gap-2 text-slate-200">
                <Activity className="w-4 h-4 text-green-500" />
                Live Activity
              </h2>
              {isConnected && (
                <span className="flex h-2 w-2 relative">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 min-h-0">
               {formattedLogs.length === 0 ? (
                 <div className="text-center py-10 text-slate-600 text-xs italic">Waiting for signals...</div>
               ) : (
                 formattedLogs.map((log) => (
                   <div key={log.id} className="bg-slate-950/50 border border-slate-800/50 rounded p-2 text-xs">
                     <div className="flex justify-between mb-1 opacity-60">
                       <span className="font-mono">{log.time}</span>
                       <span className={`font-bold uppercase ${getActionColor(log.action)}`}>{log.action}</span>
                     </div>
                     <div className="text-slate-300">
                       <span className="text-cyan-500 mr-1">{log.player}</span>
                       {log.details}
                     </div>
                   </div>
                 ))
               )}
            </div>
          </aside>

        </div>
      </main>
    </div>
  );
}
