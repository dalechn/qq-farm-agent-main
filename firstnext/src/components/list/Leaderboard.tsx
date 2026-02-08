import {
  Trophy,
  Coins,
  Loader2,
  Users,
  CheckCircle2,
  ArrowUpDown,
  RotateCw
} from "lucide-react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { type Player } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { type SortType } from "@/hooks/useGameData";

import { useState, useRef, useEffect } from "react";

interface LeaderboardStats {
  totalPlayers: number;
  harvestableCount: number;
}

// [修改] 增加 sort 属性
function PanelHeader({
  title,
  icon: Icon,
  stats,
  sortBy,
  onSortChange,
  onRefresh,
  isRefreshing
}: {
  title: string,
  icon: any,
  stats?: LeaderboardStats,
  sortBy?: SortType,
  onSortChange?: (sort: SortType) => void,
  onRefresh?: () => void,
  isRefreshing?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { t } = useI18n();

  const options: { value: SortType; label: string }[] = [
    { value: "gold", label: t('leaderboard.sort.gold') },
    { value: "level", label: t('leaderboard.sort.level') },
    { value: "active", label: t('leaderboard.sort.active') },
  ];

  const currentLabel = options.find(o => o.value === sortBy)?.label || options[0].label;

  return (
    <div className="flex-none h-10 border-b-2 border-stone-700 bg-stone-800 flex items-center px-3 gap-3 select-none justify-between z-20 relative">
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-stone-400" />
        <h2 className="font-bold text-xs text-stone-300 uppercase tracking-widest font-mono">{title}</h2>

        {/* [新增] 刷新按钮 */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1 hover:bg-stone-700 rounded transition-colors text-stone-500 hover:text-white"
            title="Refresh"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-orange-400' : ''}`} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* [新增] 自定义排序下拉框 */}
        {onSortChange && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center justify-between gap-2 bg-stone-900 border border-stone-600 px-2 py-0.5 min-w-[100px] hover:border-orange-500 transition-colors"
            >
              <span className="text-xs font-mono text-stone-300">{currentLabel}</span>
              <ArrowUpDown className="w-3 h-3 text-stone-500" />
            </button>

            {isOpen && (
              <div className="absolute right-0 top-full mt-1 w-full bg-stone-900 border border-stone-600 shadow-xl z-50 py-1">
                {options.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSortChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 text-xs font-mono hover:bg-stone-800 transition-colors
                      ${sortBy === option.value ? "text-orange-400 bg-stone-800/50" : "text-stone-400"}
                    `}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 统计数据 - 高度对齐 */}
        {stats && (
          <div className="flex items-center hidden xl:flex">
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-stone-900 border border-stone-600">
              <Users className="w-3 h-3 text-stone-400" />
              <span className="font-mono font-bold text-white text-xs">{stats.totalPlayers}</span>
            </div>
          </div>
        )}
      </div>
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
  isHiddenOnMobile?: boolean;

  // [新增] 排序 Props
  sortBy?: SortType;
  onSortChange?: (sort: SortType) => void;

  // [新增] 刷新 Props
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Leaderboard({
  players,
  selectedPlayer,
  onPlayerSelect,
  isFetchingMore,
  hasMore,
  onLoadMore,
  stats,
  isHiddenOnMobile = false,
  sortBy,
  onSortChange,
  onRefresh,
  isRefreshing
}: LeaderboardProps) {

  const { t } = useI18n();

  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const handleRefresh = () => {
    virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'auto' });
    onRefresh?.();
  };

  return (
    <div className={`lg:w-80 flex-none border-b-2 lg:border-b-0 lg:border-r-2 border-stone-700 flex flex-col bg-stone-900/50 ${isHiddenOnMobile ? 'hidden lg:flex' : 'flex'} h-full`}>
      {/* 传递排序参数 */}
      <PanelHeader
        title={t('leaderboard.title')}
        icon={Trophy}
        stats={stats}
        sortBy={sortBy}
        onSortChange={onSortChange}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      <div className="flex-1 min-h-0 bg-stone-900/50">
        {players.length === 0 && !isFetchingMore ? (
          <div className="h-full flex items-center justify-center text-stone-600 text-xs font-mono">{t('leaderboard.noSignal')}</div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            className="custom-scrollbar"
            style={{ height: "100%" }}
            data={players}
            endReached={() => {
              if (hasMore && !isFetchingMore) {
                onLoadMore();
              }
            }}
            overscan={200}
            components={{
              Footer: () => (
                <div className="py-4 flex flex-col items-center justify-center min-h-[40px] border-t border-stone-800">
                  {isFetchingMore ? (
                    <div className="flex items-center gap-2 text-xs text-stone-500 font-mono">
                      <Loader2 className="w-3 h-3 animate-spin" /> {t('leaderboard.scanning')}
                    </div>
                  ) : hasMore ? (
                    <button onClick={onLoadMore} className="text-xs text-stone-500 hover:text-orange-400 font-mono border-b border-dotted border-stone-600 hover:border-orange-400">
                      {t('leaderboard.loadMore')}
                    </button>
                  ) : (
                    <span className="text-[10px] text-stone-700 font-mono">{t('leaderboard.end')}</span>
                  )}
                </div>
              )
            }}
            itemContent={(index, player) => {
              return (
                <div
                  onClick={() => onPlayerSelect(player)}
                  className={`
                      group relative p-3 cursor-pointer transition-all duration-100 flex items-center gap-3
                      font-mono border-b border-stone-800
                      ${selectedPlayer?.id === player.id
                      ? "bg-stone-800 shadow-[inset_3px_0_0_#f97316]"
                      : "hover:bg-stone-800/50"}
                    `}
                >
                  <div className="relative flex-none">
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

                  <div className="flex flex-col flex-1 min-w-0 justify-center">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold truncate ${selectedPlayer?.id === player.id ? 'text-orange-400' : 'text-stone-300'}`}>
                        {player.name}
                      </span>
                      {/* 如果是活跃榜，可以显示一些不同的信息，比如最后活跃时间，目前简单保持一致 */}
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