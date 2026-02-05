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
  Skull,
  Trophy,
  Leaf,
  Twitter,
  Search,
  Coins,
  Gamepad2,
  ShoppingBasket
} from "lucide-react";
import { useGameData } from "@/hooks/useGameData";
import { type Player, publicApi } from "@/lib/api";
import { LandTile } from "@/components/LandTile";
import { ActivityList } from "@/components/ActivityList";
import { ShopModal } from "@/components/ShopModal"; 
import { LogSidebar } from "@/components/LogSidebar";

// 像素风状态胶囊
function MiniStat({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 border border-b-2 border-r-2 border-black/20 ${bg}`}>
      <span className="text-[8px] text-stone-900 font-bold uppercase tracking-wider">{label}</span>
      <span className={`text-xs font-mono font-bold ${color} drop-shadow-sm`}>{value}</span>
    </div>
  );
}

// 通用面板标题栏
function PanelHeader({ title, icon: Icon }: { title: string, icon: any }) {
  return (
    <div className="flex-none h-10 border-b-2 border-stone-700 bg-stone-800 flex items-center px-3 gap-2 select-none">
      <Icon className="w-4 h-4 text-stone-400" />
      <h2 className="font-bold text-xs text-stone-300 uppercase tracking-widest font-mono">{title}</h2>
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
    crops, 
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
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [isPlayerLoading, setIsPlayerLoading] = useState(false);

  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ hasMore, isFetchingMore });

  useEffect(() => {
    stateRef.current = { hasMore, isFetchingMore };
  }, [hasMore, isFetchingMore]);

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

  useEffect(() => {
    if (!initialUsername && !selectedPlayer && players.length > 0) {
      setSelectedPlayer(players[0]);
    }
  }, [players, selectedPlayer, initialUsername]);

  const handlePlayerClick = async (player: Player) => {
    if (window.innerWidth < 1024) {
      router.push(`/u/${player.name}`);
    } else {
      setSelectedPlayer(player);
      window.history.pushState(null, '', `/u/${player.name}`);
      setIsPlayerLoading(true);
      try {
        const freshData = await publicApi.getPlayerByName(player.name);
        setSelectedPlayer(freshData);
      } catch (e) {
        console.error("Failed to refresh player data", e);
      } finally {
        setIsPlayerLoading(false);
      }
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    if (window.innerWidth < 1024) {
        setIsSearching(true);
        try {
            const player = await publicApi.getPlayerByName(searchQuery.trim());
            router.push(`/u/${player.name}`);
        } catch {
            alert("User not found");
        } finally {
            setIsSearching(false);
        }
    } else {
        setIsPlayerLoading(true);
        try {
            const player = await publicApi.getPlayerByName(searchQuery.trim());
            setSelectedPlayer(player);
            window.history.pushState(null, '', `/u/${player.name}`);
        } catch (err) {
            alert("User not found!");
        } finally {
            setIsPlayerLoading(false);
        }
    }
  };

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
      <header className="h-14 border-b-2 border-stone-700 bg-stone-800 flex-none flex items-center justify-between px-4 z-40 relative gap-4 shadow-md">
        <div className="flex items-center gap-3 flex-none cursor-pointer" onClick={() => router.push('/')}>
          <div className="w-8 h-8 bg-orange-700 border-2 border-orange-500 flex items-center justify-center shadow-[2px_2px_0_0_#431407]">
            <Gamepad2 className="w-5 h-5 text-white" />
          </div>
          <div className="hidden md:block">
            <h1 className="text-lg font-bold tracking-tight text-white leading-none font-mono">FARM.OS</h1>
            <p className="text-[10px] text-stone-500 font-mono mt-0.5 uppercase">v4.9.0</p>
          </div>
        </div>

        <div className="flex-1 max-w-sm">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text"
              placeholder="SEARCH AGENT..."
              className="w-full bg-stone-900 border-2 border-stone-600 text-xs text-white pl-10 pr-3 py-1.5 outline-none focus:border-orange-500 focus:bg-stone-950 font-mono placeholder:text-stone-600 shadow-inner"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-sm flex-none">
          <div className="hidden sm:flex items-center gap-2 px-2 py-1 bg-stone-900 border border-stone-600">
            <Users className="w-3.5 h-3.5 text-stone-400" />
            <span className="font-mono font-bold text-white text-xs">{stats.totalPlayers}</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-2 py-1 bg-stone-900 border border-stone-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            <span className="font-mono font-bold text-green-400 text-xs">{stats.harvestableCount}</span>
          </div>
          
          <div className="flex items-center gap-2">
             {isConnected ? (
              <Wifi className="w-4 h-4 text-green-600 drop-shadow-[0_0_5px_rgba(34,197,94,0.3)]" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            
            <button 
              onClick={() => setIsShopOpen(true)}
              className="p-1.5 hover:bg-stone-700 active:bg-stone-900 border border-transparent hover:border-stone-500 rounded-none transition-all text-stone-400 hover:text-yellow-400"
              title="Market"
            >
              <ShoppingBasket className="w-4 h-4" />
            </button>
            
            <button 
              onClick={() => setIsActivityOpen(true)} 
              className="lg:hidden p-1.5 hover:bg-stone-700 active:bg-stone-900 border border-transparent hover:border-stone-500 rounded-none transition-all text-stone-400 hover:text-green-400"
            >
              <Activity className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

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
        
          {/* ================= 左侧：排行榜 ================= */}
          <div className={`lg:w-80 flex-none border-b-2 lg:border-b-0 lg:border-r-2 border-stone-700 flex flex-col bg-stone-900/50 ${initialUsername ? 'hidden lg:flex' : 'flex'} h-full`}>
            <PanelHeader title="AGENTS" icon={Trophy} />
            <div 
              ref={setScrollContainer}
              className="flex-1 overflow-y-auto custom-scrollbar min-h-0"
            >
              {players.length === 0 ? (
                <div className="h-full flex items-center justify-center text-stone-600 text-xs font-mono">NO SIGNAL</div>
              ) : (
                <div className="divide-y divide-stone-800">
                  {players.map((player, index) => (
                  <div
                    key={player.id}
                    onClick={() => handlePlayerClick(player)}
                    className={`
                      group relative p-3 cursor-pointer transition-all duration-100 flex items-center gap-3
                      font-mono
                      ${selectedPlayer?.id === player.id 
                        ? "bg-stone-800 shadow-[inset_3px_0_0_#f97316]" 
                        : "hover:bg-stone-800/50"}
                    `}
                  >
                    <div className="relative flex-none">
                       {/* eslint-disable-next-line @next/next/no-img-element */}
                       <img 
                          src={player.avatar} 
                          alt="avt"
                          className="w-10 h-10 bg-stone-900 border border-stone-600 object-cover"
                          style={{ imageRendering: 'pixelated' }}
                       />
                       <div className={`absolute -top-1 -left-1 w-4 h-4 flex items-center justify-center text-[9px] font-bold border shadow-sm z-10 ${
                            index < 3 ? 'bg-yellow-500 text-black border-yellow-300' : 'bg-stone-700 text-stone-300 border-stone-500'
                        }`}>
                          {index + 1}
                       </div>
                    </div>

                    <div className="flex flex-col flex-1 min-w-0 justify-center">
                       <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold truncate ${selectedPlayer?.id === player.id ? 'text-orange-400' : 'text-stone-300'}`}>
                            {player.name}
                          </span>
                       </div>
                       
                       <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-stone-500 bg-stone-950 px-1 rounded-sm">LV.{player.level}</span>
                            <span className="text-yellow-600 flex items-center gap-1 text-[10px]">
                                <Coins className="w-3 h-3" /> {player.gold > 1000 ? `${(player.gold/1000).toFixed(1)}k` : player.gold}
                            </span>
                          </div>
                          
                          {player.lands.some(l => l.status === 'harvestable') && (
                            <div className="w-2 h-2 bg-green-500 animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.8)]"></div>
                          )}
                       </div>
                    </div>
                  </div>
                ))}
                </div>
              )}

              <div ref={observerTarget} className="py-4 flex flex-col items-center justify-center min-h-[40px] border-t border-stone-800">
                 {isFetchingMore ? (
                   <div className="flex items-center gap-2 text-xs text-stone-500 font-mono">
                     <Loader2 className="w-3 h-3 animate-spin" /> SCANNING...
                   </div>
                 ) : hasMore ? (
                   <button onClick={loadMorePlayers} className="text-xs text-stone-500 hover:text-orange-400 font-mono border-b border-dotted border-stone-600 hover:border-orange-400">
                     LOAD MORE DATA
                   </button>
                 ) : (
                   <span className="text-[10px] text-stone-700 font-mono">// END OF STREAM //</span>
                 )}
              </div>
            </div>
          </div>

          {/* ================= 中间：农场详情 ================= */}
          <section className={`flex-1 flex flex-col bg-[#292524] min-w-0 relative ${!initialUsername ? 'hidden lg:flex' : 'flex'}`}>
            <PanelHeader title="VIEWPORT" icon={Sprout} />

            {(isSearching || isPlayerLoading) ? (
               <div className="h-full flex flex-col items-center justify-center text-stone-600 font-mono bg-[#1c1917] animate-pulse">
                  <Loader2 className="w-8 h-8 animate-spin mb-2 text-orange-500" />
                  <p>FETCHING DATA...</p>
               </div>
            ) : selectedPlayer ? (
              <div className="flex-1 flex flex-col min-h-0 bg-[#292524]">
                {/* 玩家信息 */}
                <div className="flex-none p-4 border-b-2 border-stone-700 bg-stone-800/50">
                  <div className="flex justify-between items-start gap-4">
                    
                    {/* 左侧：头像与信息 */}
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="relative flex-none group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={selectedPlayer.avatar} 
                          alt={selectedPlayer.name} 
                          className="w-16 h-16 bg-stone-900 border-2 border-stone-500 object-cover group-hover:border-orange-500 transition-colors"
                          style={{ imageRendering: 'pixelated' }}
                        />
                        <div className="absolute -bottom-2 -right-2 bg-stone-900 text-orange-400 text-[10px] font-bold px-1 border border-orange-400 font-mono shadow-sm">
                          LV.{selectedPlayer.level}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0 pt-0.5"> 
                        <h2 className="text-xl font-bold text-white flex items-center gap-2 font-mono uppercase truncate tracking-tight">
                          {selectedPlayer.name}
                        </h2>
                        <p className="text-[10px] text-stone-500 font-mono mb-2 truncate font-bold">UUID: {selectedPlayer.id}</p>
                        
                        <div className="flex flex-wrap gap-2">
                          {selectedPlayer.twitter ? (
                            <a 
                              href={`https://x.com/${selectedPlayer.twitter.replace('@', '')}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-300 hover:text-white bg-blue-950/50 px-2 py-0.5 border border-blue-800/50 hover:border-blue-500 transition-colors font-mono whitespace-nowrap"
                            >
                              <Twitter className="w-3 h-3" />
                              <span className="truncate max-w-[80px] sm:max-w-none">@{selectedPlayer.twitter.replace('@', '')}</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-stone-600 bg-stone-900/50 px-2 py-0.5 border border-stone-800 font-mono whitespace-nowrap">
                              <Twitter className="w-3 h-3" />
                              <span>N/A</span>
                            </span>
                          )}

                          <div className="flex items-center gap-3 text-[10px] text-stone-400 bg-stone-900/50 px-2 py-0.5 border border-stone-800 font-mono whitespace-nowrap">
                             <span className="text-white font-bold">{selectedPlayer._count?.following || 0}</span> <span className="text-[8px] uppercase">Following</span>
                             <span className="w-px h-2 bg-stone-700"></span>
                             <span className="text-white font-bold">{selectedPlayer._count?.followers || 0}</span> <span className="text-[8px] uppercase">Followers</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 右侧：Credits */}
                    <div className="text-right flex-none ml-2">
                       <div className="flex items-center justify-end gap-1.5 text-[10px] text-yellow-600 uppercase font-bold mb-1 font-mono tracking-widest">
                          <Coins className="w-3 h-3" />
                          <span>Credits</span>
                       </div>
                       <div className="text-3xl font-mono font-bold text-yellow-500 drop-shadow-[2px_2px_0_rgba(0,0,0,0.8)]">
                         {selectedPlayer.gold.toLocaleString()}
                       </div>
                    </div>
                  </div>
                </div>

                {/* 土地网格 */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#292524] min-h-0 relative shadow-[inset_0_10px_30px_rgba(0,0,0,0.3)]">
                   <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

                   <div className="flex items-center justify-between mb-4 relative z-10">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#78716c] uppercase tracking-widest font-mono">
                        <Leaf className="w-3 h-3" />
                        <span>Field Matrix</span>
                      </div>
                      
                      <div className="flex gap-2">
                         <MiniStat label="IDLE" value={selectedPlayer.lands.filter((l) => l.status === "empty").length} color="text-stone-300" bg="bg-stone-700" />
                         <MiniStat label="GROW" value={selectedPlayer.lands.filter((l) => l.status === "planted").length} color="text-blue-200" bg="bg-blue-900" />
                         <MiniStat label="RIPE" value={selectedPlayer.lands.filter((l) => l.status === "harvestable").length} color="text-green-200" bg="bg-green-900" />
                      </div>
                   </div>

                  <div className="grid grid-cols-3 gap-6 relative z-10 max-w-2xl mx-auto">
                    {selectedPlayer.lands.map((land) => (
                      <LandTile key={land.id} land={land} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-stone-600 font-mono bg-[#1c1917]">
                <Sprout className="w-16 h-16 opacity-10 mb-4" />
                <p className="tracking-widest text-xs">SELECT A UNIT TO INSPECT</p>
              </div>
            )}
          </section>

          {/* ================= 右侧：PC 端日志面板 ================= */}
          <div className="hidden lg:flex lg:w-80 flex-none border-l-2 border-stone-700 flex-col bg-stone-900 h-full">
            <PanelHeader title="SYSTEM LOG" icon={Activity} />
            {/* [修改] 将 bg-stone-950 改为 bg-stone-900/50，防止太黑 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 bg-stone-900/50">
               <ActivityList logs={formattedLogs} />
            </div>
          </div>

      </main>

      {/* ================= 模态框与抽屉 ================= */}
      
      {/* 商店模态框 */}
      <ShopModal 
        isOpen={isShopOpen} 
        onClose={() => setIsShopOpen(false)} 
        crops={crops} 
      />

      {/* 日志侧边栏 (Mobile Only) */}
      <LogSidebar 
        isOpen={isActivityOpen} 
        onClose={() => setIsActivityOpen(false)} 
        logs={formattedLogs} 
      />

    </div>
  );
}