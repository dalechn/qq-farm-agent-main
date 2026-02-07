import {
  Trophy,
  Coins,
  Loader2,
  Users,
  CheckCircle2
} from "lucide-react";
import { Virtuoso } from "react-virtuoso"; // [引入库]
import { type Player } from "@/lib/api";

interface LeaderboardStats {
  totalPlayers: number;
  harvestableCount: number;
}

// 通用面板标题栏 (复用)
function PanelHeader({ title, icon: Icon, stats }: { title: string, icon: any, stats?: LeaderboardStats }) {
  return (
    <div className="flex-none h-10 border-b-2 border-stone-700 bg-stone-800 flex items-center px-3 gap-3 select-none">
      <Icon className="w-4 h-4 text-stone-400" />
      <h2 className="font-bold text-xs text-stone-300 uppercase tracking-widest font-mono">{title}</h2>
      {stats && (
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-stone-900 border border-stone-600">
            <Users className="w-3 h-3 text-stone-400" />
            <span className="font-mono font-bold text-white text-xs">{stats.totalPlayers}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-stone-900 border border-stone-600">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            <span className="font-mono font-bold text-green-400 text-xs">{stats.harvestableCount}</span>
          </div>
        </div>
      )}
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
  stats?: LeaderboardStats;
  isHiddenOnMobile?: boolean; // 在移动端是否隐藏 (主页逻辑)
}

export function Leaderboard({
  players,
  selectedPlayer,
  onPlayerSelect,
  isFetchingMore,
  hasMore,
  onLoadMore,
  stats,
  isHiddenOnMobile = false
}: LeaderboardProps) {

  // [移除] 之前的所有 IntersectionObserver 逻辑 (scrollContainer, observerTarget, useEffect...)

  return (
    <div className={`lg:w-80 flex-none border-b-2 lg:border-b-0 lg:border-r-2 border-stone-700 flex flex-col bg-stone-900/50 ${isHiddenOnMobile ? 'hidden lg:flex' : 'flex'} h-full`}>
      <PanelHeader title="AGENTS" icon={Trophy} stats={stats} />

      {/* 列表容器：必须有 flex-1 min-h-0 以供 Virtuoso 计算高度 */}
      <div className="flex-1 min-h-0 bg-stone-900/50">
        {players.length === 0 ? (
          <div className="h-full flex items-center justify-center text-stone-600 text-xs font-mono">NO SIGNAL</div>
        ) : (
          <Virtuoso
            // [样式] 添加自定义滚动条样式，并占满高度
            className="custom-scrollbar"
            style={{ height: "100%" }}

            data={players}

            // [核心] 触底加载更多
            endReached={() => {
              if (hasMore && !isFetchingMore) {
                onLoadMore();
              }
            }}

            // 预渲染高度
            overscan={200}

            // 底部加载状态 / 结束提示
            components={{
              Footer: () => (
                <div className="py-4 flex flex-col items-center justify-center min-h-[40px] border-t border-stone-800">
                  {isFetchingMore ? (
                    <div className="flex items-center gap-2 text-xs text-stone-500 font-mono">
                      <Loader2 className="w-3 h-3 animate-spin" /> SCANNING...
                    </div>
                  ) : hasMore ? (
                    // 理论上 endReached 会自动触发，但留一个按钮以防万一
                    <button onClick={onLoadMore} className="text-xs text-stone-500 hover:text-orange-400 font-mono border-b border-dotted border-stone-600 hover:border-orange-400">
                      LOAD MORE DATA
                    </button>
                  ) : (
                    <span className="text-[10px] text-stone-700 font-mono">// END OF STREAM //</span>
                  )}
                </div>
              )
            }}

            // 单个玩家行渲染
            itemContent={(index, player) => {
              return (
                <div
                  // Virtuoso 处理 key，这里不需要 key
                  onClick={() => onPlayerSelect(player)}
                  className={`
                      group relative p-3 cursor-pointer transition-all duration-100 flex items-center gap-3
                      font-mono border-b border-stone-800
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
                    <div className={`absolute -top-1 -left-1 w-4 h-4 flex items-center justify-center text-[9px] font-bold border shadow-sm z-10 ${index < 3 ? 'bg-yellow-500 text-black border-yellow-300' : 'bg-stone-700 text-stone-300 border-stone-500'
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
                          <Coins className="w-3 h-3" /> {player.gold > 1000 ? `${(player.gold / 1000).toFixed(1)}k` : player.gold}
                        </span>
                      </div>

                      {player.lands.some(l => l.status === 'harvestable') && (
                        <div className="w-2 h-2 bg-green-500 animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.8)]"></div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}