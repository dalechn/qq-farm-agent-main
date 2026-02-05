import { useEffect, useRef, useState } from "react";
import { 
  Trophy, 
  Coins, 
  Loader2 
} from "lucide-react";
import { type Player } from "@/lib/api";

// 通用面板标题栏 (复用)
function PanelHeader({ title, icon: Icon }: { title: string, icon: any }) {
  return (
    <div className="flex-none h-10 border-b-2 border-stone-700 bg-stone-800 flex items-center px-3 gap-2 select-none">
      <Icon className="w-4 h-4 text-stone-400" />
      <h2 className="font-bold text-xs text-stone-300 uppercase tracking-widest font-mono">{title}</h2>
    </div>
  );
}

interface LeaderboardProps {
  players: Player[];
  selectedPlayer: Player | null;
  onPlayerSelect: (player: Player) => void;
  isFetchingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  isHiddenOnMobile?: boolean; // 在移动端是否隐藏 (主页逻辑)
}

export function Leaderboard({ 
  players, 
  selectedPlayer, 
  onPlayerSelect, 
  isFetchingMore, 
  hasMore, 
  onLoadMore,
  isHiddenOnMobile = false
}: LeaderboardProps) {
  
  // 滚动容器和观察目标
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  
  // 使用 ref 保存最新的状态，避免闭包陷阱
  const stateRef = useRef({ hasMore, isFetchingMore });
  useEffect(() => {
    stateRef.current = { hasMore, isFetchingMore };
  }, [hasMore, isFetchingMore]);

  // 无限滚动监听
  useEffect(() => {
    if (!scrollContainer) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const { hasMore, isFetchingMore } = stateRef.current;
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
          onLoadMore();
        }
      },
      { root: scrollContainer, threshold: 0.1, rootMargin: "200px" }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [scrollContainer, onLoadMore]);

  return (
    <div className={`lg:w-80 flex-none border-b-2 lg:border-b-0 lg:border-r-2 border-stone-700 flex flex-col bg-stone-900/50 ${isHiddenOnMobile ? 'hidden lg:flex' : 'flex'} h-full`}>
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
              onClick={() => onPlayerSelect(player)}
              className={`
                group relative p-3 cursor-pointer transition-all duration-100 flex items-center gap-3
                font-mono
                ${selectedPlayer?.id === player.id 
                  ? "bg-stone-800 shadow-[inset_3px_0_0_#f97316]" 
                  : "hover:bg-stone-800/50"}
              `}
            >
              {/* 头像与角标 */}
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

              {/* 详细信息 */}
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

        {/* Loading / End Indicator */}
        <div ref={observerTarget} className="py-4 flex flex-col items-center justify-center min-h-[40px] border-t border-stone-800">
           {isFetchingMore ? (
             <div className="flex items-center gap-2 text-xs text-stone-500 font-mono">
               <Loader2 className="w-3 h-3 animate-spin" /> SCANNING...
             </div>
           ) : hasMore ? (
             <button onClick={onLoadMore} className="text-xs text-stone-500 hover:text-orange-400 font-mono border-b border-dotted border-stone-600 hover:border-orange-400">
               LOAD MORE DATA
             </button>
           ) : (
             <span className="text-[10px] text-stone-700 font-mono">// END OF STREAM //</span>
           )}
        </div>
      </div>
    </div>
  );
}