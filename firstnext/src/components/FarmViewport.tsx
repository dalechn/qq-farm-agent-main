import {
    Sprout,
    Loader2,
    Leaf,
    Coins,
    Twitter,
    ArrowLeft,
    Bug,
    X,
  } from "lucide-react";
  import { useRouter } from "next/navigation";
  import { type Player, type FollowUser, getFollowers, getFollowing } from "@/lib/api";
  import { LandTile } from "@/components/LandTile";
  import { useState, useEffect } from "react";

  import { PatrolDog } from "@/components/PatrolDog";
  import { DebugSidebar } from "@/components/DebugSidebar";
  import { UserListSidebar } from "@/components/UserListSidebar";

  // 辅助组件：面板标题
  function PanelHeader({ 
    title, 
    icon: Icon, 
    showBack, 
    onBack,
    rightContent 
  }: { 
    title: string, 
    icon: any, 
    showBack?: boolean, 
    onBack?: () => void,
    rightContent?: React.ReactNode
  }) {
    return (
      <div className="flex-none h-10 border-b-2 border-stone-700 bg-stone-800 flex items-center justify-between px-3 select-none">
        <div className="flex items-center gap-2">
            {showBack && (
            <button 
                onClick={onBack} 
                className="mr-1 text-stone-400 hover:text-white lg:hidden p-1 hover:bg-stone-700 rounded-sm transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
            </button>
            )}
            <Icon className="w-4 h-4 text-stone-400" />
            <h2 className="font-bold text-xs text-stone-300 uppercase tracking-widest font-mono">{title}</h2>
        </div>
        {rightContent}
      </div>
    );
  }
  
  // 辅助组件：状态胶囊
  function MiniStat({ label, value, color, bg }: { label: string; value: number | string; color: string; bg: string }) {
    return (
      <div className={`flex items-center gap-2 px-2 py-1 border border-b-2 border-r-2 border-black/20 ${bg}`}>
        <span className="text-[8px] text-stone-900 font-bold uppercase tracking-wider">{label}</span>
        <span className={`text-xs font-mono font-bold ${color} drop-shadow-sm`}>{value}</span>
      </div>
    );
  }
  
  interface FarmViewportProps {
    selectedPlayer: Player | null;
    isSearching: boolean;
    isPlayerLoading: boolean;
    showOnMobile: boolean;
  }

  const TOTAL_LAND_SLOTS = 18;
  
  export function FarmViewport({ 
    selectedPlayer, 
    isSearching, 
    isPlayerLoading, 
    showOnMobile 
  }: FarmViewportProps) {
    const router = useRouter();
    const isLoading = isSearching || isPlayerLoading;
    
    // [修改] 控制调试侧边栏的状态
    const [showDebugSidebar, setShowDebugSidebar] = useState(false);

    // [新增] 用户列表弹窗状态
    const [isUserListSidebarOpen, setIsUserListSidebarOpen] = useState(false);
    const [userListSidebarType, setUserListSidebarType] = useState<'following' | 'followers'>('following');
    const [userListPlayerId, setUserListPlayerId] = useState<string>('');
    
    // 保留 debugMode 状态用于前端视觉调试（如强制显示狗的特定状态），如果不需要可以移除
    // 这里暂时设为 false，主要逻辑移交给 Sidebar
    const debugMode = false; 
  
    // 计算狗是否处于激活状态
    const now = new Date();
    // @ts-ignore: 假设 Player 接口中有 dogActiveUntil 和 hasDog
    const activeUntil = selectedPlayer?.dogActiveUntil ? new Date(selectedPlayer.dogActiveUntil) : null;
    // @ts-ignore
    const hasDog = !!selectedPlayer?.hasDog;
    const isDogActive = !!(hasDog && activeUntil && activeUntil > now);
  
    const [remainingTime, setRemainingTime] = useState<string | null>(null);
  
    useEffect(() => {
        if (!activeUntil) {
            setRemainingTime(null);
            return;
        }
  
        const updateTime = () => {
            const now = new Date();
            const diff = activeUntil.getTime() - now.getTime();
  
            if (diff <= 0) {
                setRemainingTime(null);
                return;
            }
  
            const minutes = Math.floor((diff / 1000 / 60) % 60);
            const hours = Math.floor((diff / 1000 / 60 / 60));
            setRemainingTime(`${hours}h ${minutes}m`);
        };
  
        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, [activeUntil, debugMode]);
  
    // 计算 Security 状态显示的配置
    let secConfig = { value: "NULL", color: "text-stone-500", bg: "bg-stone-800" };
    if (hasDog) {
        if (debugMode) {
            const randomMin = Math.floor(Math.random() * 120) + 10;
            const displayTime = `${Math.floor(randomMin / 60)}h ${randomMin % 60}m`;
            secConfig = { value: displayTime, color: "text-cyan-200", bg: "bg-cyan-950" };
        } else if (isDogActive) {
             secConfig = { value: remainingTime || "0m", color: "text-cyan-200", bg: "bg-cyan-950" };
        } else {
            secConfig = { value: "LOW", color: "text-orange-200", bg: "bg-orange-950" };
        }
    }
  
    return (
      <section className={`flex-1 flex flex-col bg-[#292524] min-w-0 relative ${!showOnMobile ? 'hidden lg:flex' : 'flex'}`}>
        
        {/* [新增] 调试侧边栏组件 */}
        <DebugSidebar
            isOpen={showDebugSidebar}
            onClose={() => setShowDebugSidebar(false)}
            currentPlayerId={selectedPlayer?.id}
        />

        {/* [新增] 用户列表弹窗 */}
        <UserListSidebar
            isOpen={isUserListSidebarOpen}
            onClose={() => setIsUserListSidebarOpen(false)}
            type={userListSidebarType}
            playerId={userListPlayerId}
        />
  
        <PanelHeader 
          title="VIEWPORT" 
          icon={Sprout} 
          showBack={showOnMobile}
          onBack={() => router.push('/')}
          rightContent={
              // [修改] 按钮点击打开 Sidebar
              <button 
                onClick={() => setShowDebugSidebar(true)}
                className={`flex items-center gap-1.5 px-2 py-1 text-[9px] font-mono border transition-all bg-stone-900 border-stone-700 text-stone-500 hover:text-stone-300 hover:border-orange-500 hover:text-orange-500`}
              >
                  <Bug className="w-3 h-3" />
                  <span>DEBUG PANEL</span>
              </button>
          }
        />
  
        {isLoading ? (
           <div className="h-full flex flex-col items-center justify-center text-stone-600 font-mono bg-[#1c1917] animate-pulse">
              <Loader2 className="w-8 h-8 animate-spin mb-2 text-orange-500" />
              <p>FETCHING DATA...</p>
           </div>
        ) : selectedPlayer ? (
          <div className="flex-1 flex flex-col min-h-0 bg-[#292524]">
            {/* 玩家信息 Header */}
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
                         <button
                            onClick={() => {
                                setUserListSidebarType('following');
                                setUserListPlayerId(selectedPlayer.id);
                                setIsUserListSidebarOpen(true);
                            }}
                            className="hover:text-orange-400 transition-colors"
                         >
                            <span className="text-white font-bold">{selectedPlayer._count?.following || 0}</span> <span className="text-[8px] uppercase">Following</span>
                         </button>
                         <span className="w-px h-2 bg-stone-700"></span>
                         <button
                            onClick={() => {
                                setUserListSidebarType('followers');
                                setUserListPlayerId(selectedPlayer.id);
                                setIsUserListSidebarOpen(true);
                            }}
                            className="hover:text-orange-400 transition-colors"
                         >
                            <span className="text-white font-bold">{selectedPlayer._count?.followers || 0}</span> <span className="text-[8px] uppercase">Followers</span>
                         </button>
                      </div>
                    </div>
                  </div>
                </div>
  
                {/* 右侧：Credits */}
                <div className="text-right flex-none ml-2 flex flex-col items-end gap-4">
                   <div>
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
            </div>
  
            {/* 土地网格区域 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#292524] min-h-0 relative shadow-[inset_0_10px_30px_rgba(0,0,0,0.3)]">
               <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
  
               {/* 顶部统计栏 */}
               <div className="flex items-center justify-between mb-4 relative z-10 overflow-x-auto pb-2 sm:pb-0">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#78716c] uppercase tracking-widest font-mono flex-shrink-0">
                    <Leaf className="w-3 h-3" />
                    <span>Field Matrix</span>
                  </div>
                  
                  <div className="flex gap-2 flex-nowrap">
                     <MiniStat label="IDLE" value={selectedPlayer.lands.filter((l) => l.status === "empty").length} color="text-stone-300" bg="bg-stone-700" />
                     <MiniStat label="GROW" value={selectedPlayer.lands.filter((l) => l.status === "planted").length} color="text-blue-200" bg="bg-blue-900" />
                     <MiniStat 
                       label="CARE" 
                       value={selectedPlayer.lands.filter((l) => l.status !== "withered" && (l.hasWeeds || l.hasPests || l.needsWater)).length} 
                       color="text-yellow-200" 
                       bg="bg-yellow-900" 
                     />
                     <MiniStat label="RIPE" value={selectedPlayer.lands.filter((l) => l.status === "harvestable").length} color="text-green-200" bg="bg-green-900" />
                     <MiniStat label="DEAD" value={selectedPlayer.lands.filter((l) => l.status === "withered").length} color="text-red-200" bg="bg-red-900" />
                     
                     {/* Security Status MiniStat */}
                     <MiniStat 
                        label="SEC" 
                        value={secConfig.value} 
                        color={secConfig.color} 
                        bg={secConfig.bg} 
                     />
                  </div>
               </div>
  
              {/* 网格容器：这是狗巡逻的相对参照物 */}
              <div className="relative max-w-2xl mx-auto">
                  {/* 巡逻狗层 */}
                  <PatrolDog isActive={isDogActive} isDebug={debugMode} />
  
                  {/* 土地 Grid */}
                  <div className="grid grid-cols-3 gap-6 relative z-10">
                    {Array.from({ length: TOTAL_LAND_SLOTS }).map((_, index) => {
                      const land = selectedPlayer.lands.find(l => l.position === index);
                      return (
                        <LandTile 
                          key={land ? land.id : `locked-${index}`} 
                          land={land} 
                          locked={!land} 
                        />
                      );
                    })}
                  </div>
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
    );
  }