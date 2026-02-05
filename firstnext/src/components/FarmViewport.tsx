import { 
    Sprout, 
    Loader2, 
    Leaf, 
    Coins, 
    Twitter,
    ArrowLeft
  } from "lucide-react";
  import { useRouter } from "next/navigation";
  import { type Player } from "@/lib/api";
  import { LandTile } from "@/components/LandTile";
  
  // 辅助组件：面板标题
  function PanelHeader({ 
    title, 
    icon: Icon, 
    showBack, 
    onBack 
  }: { 
    title: string, 
    icon: any, 
    showBack?: boolean, 
    onBack?: () => void 
  }) {
    return (
      <div className="flex-none h-10 border-b-2 border-stone-700 bg-stone-800 flex items-center px-3 gap-2 select-none">
        {/* [新增] 移动端返回按钮 */}
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
    );
  }
  
  // 辅助组件：状态胶囊
  function MiniStat({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
    // 如果值为 0 且不是 IDLE/GROW/RIPE 这种常驻状态，可以选择隐藏，或者为了布局整齐一直显示
    // 这里我们一直显示，保持矩阵完整性
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
    showOnMobile: boolean; // 控制在移动端的显示逻辑
  }
  
  export function FarmViewport({ 
    selectedPlayer, 
    isSearching, 
    isPlayerLoading, 
    showOnMobile 
  }: FarmViewportProps) {
    const router = useRouter();
    const isLoading = isSearching || isPlayerLoading;
  
    return (
      <section className={`flex-1 flex flex-col bg-[#292524] min-w-0 relative ${!showOnMobile ? 'hidden lg:flex' : 'flex'}`}>
        {/* [修改] 传入返回逻辑 */}
        <PanelHeader 
          title="VIEWPORT" 
          icon={Sprout} 
          showBack={showOnMobile}
          onBack={() => router.push('/')}
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
  
            {/* 土地网格区域 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#292524] min-h-0 relative shadow-[inset_0_10px_30px_rgba(0,0,0,0.3)]">
               <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
  
               <div className="flex items-center justify-between mb-4 relative z-10 overflow-x-auto pb-2 sm:pb-0">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#78716c] uppercase tracking-widest font-mono flex-shrink-0">
                    <Leaf className="w-3 h-3" />
                    <span>Field Matrix</span>
                  </div>
                  
                  {/* [修改] 扩展状态显示：增加 CARE (黄) 和 DEAD (红) */}
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
    );
  }