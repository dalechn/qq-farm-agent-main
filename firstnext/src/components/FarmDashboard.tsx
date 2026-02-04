"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Sprout, 
  Activity,
  Users,
  CheckCircle2,
  Loader2,
  Wifi,
  WifiOff,
  RefreshCw,
  Skull,
  Trophy,
  Leaf,
  Twitter,
  Search,
  X,
  Coins,
  ChevronDown
} from "lucide-react";
import { useGameData } from "@/hooks/useGameData";
import { type Player, publicApi } from "@/lib/api";
import { LandTile } from "@/components/LandTile";

function getActionColor(action: string) {
  const map: Record<string, string> = {
    HARVEST: "text-green-400",
    PLANT: "text-blue-400",
    STEAL: "text-red-400",
    JOIN: "text-cyan-400",
  };
  return map[action] || "text-slate-400";
}

// 提取 Activity Log 列表组件
function ActivityList({ logs, getActionColor }: { logs: any[], getActionColor: (a:string)=>string }) {
  if (logs.length === 0) {
    return <div className="text-center py-10 text-slate-600 text-xs italic">Waiting for signals...</div>;
  }
  return (
    <div className="space-y-2">
      {logs.map((log) => (
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
      ))}
    </div>
  );
}

// 迷你状态胶囊组件 (用于 Farm Grid 标题行)
function MiniStat({ label, value, color, dotColor }: { label: string; value: number; color: string; dotColor: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-950/30 px-2.5 py-1 rounded-full border border-slate-800/50">
      <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className="text-[10px] text-slate-500 uppercase font-medium hidden sm:inline">{label}</span>
      <span className={`text-xs font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}

interface FarmDashboardProps {
  initialUsername?: string;
}

export function FarmDashboard({ initialUsername }: FarmDashboardProps) {
  const router = useRouter();
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
  
  // UI 状态
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ hasMore, isFetchingMore });

  useEffect(() => {
    stateRef.current = { hasMore, isFetchingMore };
  }, [hasMore, isFetchingMore]);

  // 处理初始用户 (URL 访问)
  useEffect(() => {
    if (initialUsername) {
      setIsSearching(true);
      publicApi.getPlayerByName(initialUsername)
        .then((player) => {
          setSelectedPlayer(player);
        })
        .catch(() => {
          console.error(`User ${initialUsername} not found`);
        })
        .finally(() => setIsSearching(false));
    }
  }, [initialUsername]);

  // 默认选中逻辑
  useEffect(() => {
    if (!initialUsername && !selectedPlayer && players.length > 0) {
      setSelectedPlayer(players[0]);
    }
  }, [players, selectedPlayer, initialUsername]);

  // 玩家点击处理逻辑
  const handlePlayerClick = (player: Player) => {
    if (window.innerWidth < 1024) {
      // 移动端：跳转到独立页面
      router.push(`/u/${player.name}`);
    } else {
      // 桌面端：仅切换状态
      setSelectedPlayer(player);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const player = await publicApi.getPlayerByName(searchQuery.trim());
      if (window.innerWidth < 1024) {
        router.push(`/u/${player.name}`);
      } else {
        setSelectedPlayer(player);
      }
    } catch (err) {
      alert("User not found!");
    } finally {
      setIsSearching(false);
    }
  };

  // 滚动加载监听
  useEffect(() => {
    if (!scrollContainer) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const { hasMore, isFetchingMore } = stateRef.current;
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
          loadMorePlayers();
        }
      },
      { root: scrollContainer, threshold: 0.1, rootMargin: "200px" }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [scrollContainer, loadMorePlayers]);

  const formattedLogs = useMemo(() => {
    return logs.map((log, index) => ({
      id: `${log.timestamp}-${index}`,
      time: new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      player: log.playerName,
      action: log.action,
      details: log.details,
    }));
  }, [logs]);

  if (isLoading && !selectedPlayer) {
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
      <header className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex-none flex items-center justify-between px-4 sm:px-6 z-40 relative gap-4">
        
        {/* Left: Logo & Title */}
        <div className="flex items-center gap-3 flex-none">
          <div className="w-8 h-8 rounded bg-cyan-500/20 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.5)] cursor-pointer" onClick={() => router.push('/')}>
            <Sprout className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="hidden md:block">
            <h1 className="text-lg font-bold tracking-tight text-white leading-none">QQ Farm Control</h1>
            <p className="text-[10px] text-cyan-500/80 font-mono mt-0.5">AGENT MONITOR V3.5</p>
          </div>
        </div>

        {/* Middle: Search Bar */}
        <div className="flex-1 max-w-sm">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
            <input
              type="text"
              placeholder="Search agent..."
              className="w-full bg-slate-950/50 border border-slate-800 rounded-full text-xs text-slate-200 pl-9 pr-3 py-1.5 outline-none focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-slate-800 placeholder:text-slate-600"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
        </div>

        {/* Right: Controls & Stats */}
        <div className="flex items-center gap-2 sm:gap-4 text-sm flex-none">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-900 rounded border border-slate-800">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono font-bold text-white">{stats.totalPlayers}</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-900 rounded border border-slate-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            <span className="text-slate-400 text-xs hidden sm:inline">Harvestable</span>
            <span className="font-mono font-bold text-green-400">{stats.harvestableCount}</span>
          </div>
          
          <div className="w-px h-6 bg-slate-800 mx-1 hidden sm:block" />
          
          <div className="flex items-center gap-2">
             {isConnected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            
            {/* <button onClick={refresh} className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-cyan-400">
              <RefreshCw className="w-4 h-4" />
            </button> */}
            
            <button 
              onClick={() => setIsActivityOpen(true)} 
              className="lg:hidden p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-green-400"
            >
              <Activity className="w-4 h-4" />
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
      <main className="flex-1 min-h-0 p-4 sm:p-6 overflow-hidden z-10 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          
          {/* ================= 左侧：排行榜 ================= */}
          <aside className={`
            ${initialUsername ? 'hidden lg:flex' : 'flex'} 
            lg:col-span-3 flex-col bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm shadow-xl h-full min-h-0
          `}>
            <div className="flex-none p-4 border-b border-slate-800/50 flex flex-col gap-3 bg-slate-900/50">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm flex items-center gap-2 text-slate-200">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  Leaderboard
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                  TOP GOLD
                </span>
              </div>
            </div>

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
                    onClick={() => handlePlayerClick(player)}
                    className={`
                      group relative p-3 rounded-lg border cursor-pointer transition-all duration-200
                      ${selectedPlayer?.id === player.id 
                        ? "bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]" 
                        : "bg-slate-900/40 border-slate-800/50 hover:bg-slate-800/60 hover:border-slate-700"}
                    `}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                         <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={player.avatar} 
                            alt={player.name}
                            className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 object-cover"
                          />
                          <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold font-mono border border-slate-900 ${index < 3 ? 'bg-yellow-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>
                            {index + 1}
                          </div>
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
          <section className={`
            ${!initialUsername ? 'hidden lg:flex' : 'flex'}
            lg:col-span-6 flex-col bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm shadow-xl h-full min-h-0
          `}>
            {isSearching && !selectedPlayer ? (
               <div className="h-full flex flex-col items-center justify-center text-slate-600">
                  <Loader2 className="w-8 h-8 animate-spin mb-2 text-cyan-500" />
                  <p>Searching player...</p>
               </div>
            ) : selectedPlayer ? (
              <>
                <div className="flex-none p-4 border-b border-slate-800 bg-gradient-to-r from-cyan-950/30 to-transparent">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      {/* 大头像 */}
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={selectedPlayer.avatar} 
                          alt={selectedPlayer.name} 
                          className="w-16 h-16 rounded-xl bg-slate-800/50 border-2 border-slate-700 shadow-lg object-cover"
                        />
                        <div className="absolute -bottom-2 -right-2 bg-slate-900 text-cyan-500 text-xs font-bold px-2 py-0.5 rounded border border-slate-700">
                          Lv.{selectedPlayer.level}
                        </div>
                      </div>
                      
                      <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                          {selectedPlayer.name}
                        </h2>
                        <p className="text-xs text-slate-500 font-mono mb-2">ID: {selectedPlayer.id}</p>
                        
                        <div className="flex flex-wrap gap-2">
                          {selectedPlayer.twitter ? (
                            <a 
                              href={`https://x.com/${selectedPlayer.twitter.replace('@', '')}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 bg-blue-900/20 px-2 py-0.5 rounded border border-blue-900/50 transition-colors"
                            >
                              <Twitter className="w-3 h-3" />
                              <span>@{selectedPlayer.twitter.replace('@', '')}</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 bg-slate-800/20 px-2 py-0.5 rounded border border-slate-800/50">
                              <Twitter className="w-3 h-3" />
                              <span>Unlinked</span>
                            </span>
                          )}

                          <div className="flex items-center gap-3 text-[10px] text-slate-400 bg-slate-900/50 px-2 py-0.5 rounded border border-slate-800">
                            <div className="flex items-center gap-1">
                              <span className="text-slate-200 font-bold font-mono">
                                {selectedPlayer._count?.following || 0}
                              </span>
                              <span>Following</span>
                            </div>
                            <div className="w-px h-2 bg-slate-700"></div>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-200 font-bold font-mono">
                                {selectedPlayer._count?.followers || 0}
                              </span>
                              <span>Followers</span>
                            </div>
                          </div>
                        </div>
</div>
                      </div>

                      {/* GOLD 显示在最右边 */}
                      <div className="text-right">
                         <div className="flex items-center justify-end gap-1.5 text-xs text-yellow-500/80 uppercase tracking-widest font-bold mb-1">
                            <Coins className="w-3.5 h-3.5" />
                            <span>Gold</span>
                         </div>
                         <div className="text-2xl font-mono font-bold text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.3)]">
                           {selectedPlayer.gold.toLocaleString()}
                         </div>
                      </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-slate-950/30 min-h-0">
                   {/* Farm Grid 标题栏 + 状态统计 */}
                   <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                        <Leaf className="w-3 h-3" />
                        <span>Farm Grid</span>
                      </div>
                      
                      <div className="flex gap-2 sm:gap-3">
                         <MiniStat 
                           label="Empty" 
                           value={selectedPlayer.lands.filter((l) => l.status === "empty").length}
                           color="text-slate-300"
                           dotColor="bg-slate-500"
                         />
                         <MiniStat 
                           label="Growing" 
                           value={selectedPlayer.lands.filter((l) => l.status === "planted").length}
                           color="text-blue-400"
                           dotColor="bg-blue-500"
                         />
                         <MiniStat 
                           label="Ready" 
                           value={selectedPlayer.lands.filter((l) => l.status === "harvestable").length}
                           color="text-green-400"
                           dotColor="bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"
                         />
                      </div>
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

          {/* ================= 右侧：Live Activity (桌面端) ================= */}
          <aside className="hidden lg:flex lg:col-span-3 flex-col bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm shadow-xl h-full min-h-0">
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

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 min-h-0">
               <ActivityList logs={formattedLogs} getActionColor={getActionColor} />
            </div>
          </aside>

        </div>
      </main>

      {/* ================= 移动端 Activity 侧边栏 ================= */}
      {isActivityOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" 
            onClick={() => setIsActivityOpen(false)} 
          />
          <div className="relative w-80 bg-slate-900 h-full border-l border-slate-800 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="flex-none p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <h2 className="font-bold text-sm flex items-center gap-2 text-slate-200">
                <Activity className="w-4 h-4 text-green-500" />
                Live Activity
              </h2>
              <button 
                onClick={() => setIsActivityOpen(false)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
               <ActivityList logs={formattedLogs} getActionColor={getActionColor} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}