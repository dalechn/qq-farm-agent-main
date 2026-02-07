// src/components/FarmViewport.tsx

import {
  Sprout,
  Loader2,
  Leaf,
  Coins,
  Twitter,
  ArrowLeft,
  Bug,
  X,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type Player, type FollowUser, getFollowers, getFollowing } from "@/lib/api";
import { LandTile } from "@/components/LandTile";
import { useState, useEffect } from "react";

import { PatrolDog } from "@/components/PatrolDog";
import { DebugSidebar } from "@/components/DebugSidebar";
import { UserListSidebar } from "@/components/UserListSidebar";
import { useGame } from "@/context/GameContext";
import { useI18n } from "@/lib/i18n";

// [新增] 升级经验表 (与后端保持一致)
const LEVEL_UP_EXP = [
  100, 200, 400, 800, 1500, 2500, 4000, 6000, 9000,
  13000, 18000, 24000, 31000, 39000, 48000, 58000, 69000, 81000, 94000, 108000,
  125000, 145000, 170000, 200000, 240000, 290000, 350000, 420000, 500000, 600000,
  999999999
];

function formatJoinDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

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
    <div className="flex-none h-10 border-b-2 border-stone-700 bg-stone-800 flex items-center justify-between px-3 select-none z-20 relative">
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
  onRefresh?: () => void;
}

const TOTAL_LAND_SLOTS = 18;

export function FarmViewport({
  selectedPlayer,
  isSearching,
  isPlayerLoading,
  showOnMobile,
  onRefresh
}: FarmViewportProps) {
  const router = useRouter();
  const { myPlayer } = useGame();
  const { t } = useI18n();

  const isLoading = isSearching || isPlayerLoading;
  const [showDebugSidebar, setShowDebugSidebar] = useState(false);
  const [isUserListSidebarOpen, setIsUserListSidebarOpen] = useState(false);
  const [userListSidebarType, setUserListSidebarType] = useState<'following' | 'followers'>('following');
  const [userListPlayerId, setUserListPlayerId] = useState<string>('');
  const debugMode = false;

  const isOwner = !!(selectedPlayer && myPlayer && selectedPlayer.id === myPlayer.id);

  // [新增] 计算经验进度
  const levelIndex = (selectedPlayer?.level || 1) - 1;
  const nextLevelExp = LEVEL_UP_EXP[levelIndex] || 999999999;
  const currentExp = selectedPlayer?.exp || 0;
  const expPercent = Math.min(100, Math.max(0, (currentExp / nextLevelExp) * 100));

  // 计算狗状态
  const now = new Date();
  // @ts-ignore
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
    <section className={`flex-1 flex flex-col bg-[#292524] min-w-0 relative h-full overflow-hidden ${!showOnMobile ? 'hidden lg:flex' : 'flex'}`}>

      <DebugSidebar
        isOpen={showDebugSidebar}
        onClose={() => setShowDebugSidebar(false)}
        currentPlayerId={selectedPlayer?.id}
      />

      <UserListSidebar
        isOpen={isUserListSidebarOpen}
        onClose={() => setIsUserListSidebarOpen(false)}
        type={userListSidebarType}
        playerId={userListPlayerId}
      />

      <PanelHeader
        title={t('viewport.title')}
        icon={Sprout}
        showBack={showOnMobile}
        onBack={() => router.push('/')}
        rightContent={
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className={`
                  flex items-center gap-1.5 px-2 py-1 text-[9px] font-mono border transition-all 
                  bg-stone-900 border-stone-700 text-stone-500 
                  hover:text-stone-300 hover:border-blue-500 hover:text-blue-500
                  active:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed
                `}
              title="Refresh Data"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('viewport.refresh')}</span>
            </button>

            <button
              onClick={() => setShowDebugSidebar(true)}
              className={`flex items-center gap-1.5 px-2 py-1 text-[9px] font-mono border transition-all bg-stone-900 border-stone-700 text-stone-500 hover:text-stone-300 hover:border-orange-500 hover:text-orange-500`}
            >
              <Bug className="w-3 h-3" />
              <span>{t('viewport.debug')}</span>
            </button>
          </div>
        }
      />

      {isLoading ? (
        <div className="h-full flex flex-col items-center justify-center text-stone-600 font-mono bg-[#1c1917] animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin mb-2 text-orange-500" />
          <p>{t('viewport.fetching')}</p>
        </div>
      ) : selectedPlayer ? (
        <div className="flex-1 flex flex-col min-h-0 bg-[#292524] overflow-hidden">

          {/* 玩家信息 Header */}
          <div className="flex-none p-4 border-b-2 border-stone-700 bg-stone-800/50 z-10">
            <div className="flex justify-between items-start gap-4">

              <div className="flex items-start gap-4 flex-1 min-w-0">
                {/* [修改] 头像区域改为 Flex Column 以容纳进度条 */}
                <div className="flex flex-col items-center gap-1.5 mr-1">
                  <div className="relative flex-none group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedPlayer.avatar || "https://robohash.org/default.png?set=set1"}
                      alt={selectedPlayer.name}
                      className="w-16 h-16 bg-stone-900 border-2 border-stone-500 object-cover group-hover:border-orange-500 transition-colors"
                      style={{ imageRendering: 'pixelated' }}
                    />
                    {/* [修改] 等级标签移到左上角 */}
                    <div className="absolute -top-2 -left-2 bg-stone-900 text-orange-400 text-[10px] font-bold px-1 border border-orange-400 font-mono shadow-sm z-10">
                      LV.{selectedPlayer.level}
                    </div>
                  </div>

                  {/* [新增] 经验进度条 */}
                  <div className="w-full flex flex-col gap-0.5">
                    <div className="w-16 h-1 bg-stone-700 rounded-full overflow-hidden border border-stone-600">
                      <div
                        className="h-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${expPercent}%` }}
                      />
                    </div>
                    <div className="text-[7px] text-stone-500 font-mono text-center leading-none tracking-tight">
                      {currentExp}/{nextLevelExp} XP
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white font-mono uppercase truncate tracking-tight">
                      {selectedPlayer.name}
                    </h2>
                    {/* [修改] YOU 标签样式优化 */}
                    {isOwner && (
                      <span className="text-[9px] leading-none py-0.5 bg-green-900/80 text-green-300 px-1.5 rounded-sm border border-green-700/50 shadow-sm font-mono tracking-wide">
                        {t('viewport.you')}
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-stone-500 font-mono mb-2 truncate font-bold">UUID: {selectedPlayer.id}</p>

                  <div className="flex flex-wrap gap-2">
                    {selectedPlayer.twitter ? (
                      <a
                        href={`https://x.com/${selectedPlayer.twitter.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-blue-300 hover:text-white bg-blue-950/50 px-2 py-0.5 border border-blue-800/50 hover:border-blue-500 transition-colors font-mono whitespace-nowrap"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 50 45" fill="currentColor">
                          <path d="M39.2,0h7.6L30.2,19.1L49.8,45H34.4l-12-15.7L8.6,45H1l17.8-20.4L0,0h15.8l10.9,14.4L39.2,0z M36.5,40.4h4.2L13.5,4.3H8.9 L36.5,40.4z" />
                        </svg>
                        <span className="truncate max-w-[80px] sm:max-w-none">@{selectedPlayer.twitter.replace('@', '')}</span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-stone-600 bg-stone-900/50 px-2 py-0.5 border border-stone-800 font-mono whitespace-nowrap">
                        <svg className="w-3 h-3" viewBox="0 0 50 45" fill="currentColor">
                          <path d="M39.2,0h7.6L30.2,19.1L49.8,45H34.4l-12-15.7L8.6,45H1l17.8-20.4L0,0h15.8l10.9,14.4L39.2,0z M36.5,40.4h4.2L13.5,4.3H8.9 L36.5,40.4z" />
                        </svg>
                        <span>N/A</span>
                      </span>
                    )}


                    <div className="flex items-center gap-3 text-[10px] text-stone-400 bg-stone-900/50 px-2 py-0.5 border border-stone-800 font-mono whitespace-nowrap">
                      <button
                        // onClick={() => {
                        //   setUserListSidebarType('following');
                        //   setUserListPlayerId(selectedPlayer.id);
                        //   setIsUserListSidebarOpen(true);
                        // }}
                        className="hover:text-orange-400 transition-colors"
                      >
                        <span className="text-white font-bold">{selectedPlayer._count?.following || 0}</span> <span className="text-[8px] uppercase">{t('viewport.following')}</span>
                      </button>
                      <span className="w-px h-2 bg-stone-700"></span>
                      <button
                        // onClick={() => {
                        //   setUserListSidebarType('followers');
                        //   setUserListPlayerId(selectedPlayer.id);
                        //   setIsUserListSidebarOpen(true);
                        // }}
                        className="hover:text-orange-400 transition-colors"
                      >
                        <span className="text-white font-bold">{selectedPlayer._count?.followers || 0}</span> <span className="text-[8px] uppercase">{t('viewport.followers')}</span>
                      </button>

                      <span className="w-px h-2 bg-stone-700"></span>


                      <span className="text-stone-500">
                        <span className="text-white">{t('viewport.joined')}</span> {formatJoinDate(selectedPlayer.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-right flex-none ml-2 flex flex-col items-end gap-4">
                <div>
                  <div className="flex items-center justify-end gap-1.5 text-[10px] text-yellow-600 uppercase font-bold mb-1 font-mono tracking-widest">
                    <Coins className="w-3 h-3" />
                    <span>{t('viewport.credits')}</span>
                  </div>
                  <div className="text-3xl font-mono font-bold text-yellow-500 drop-shadow-[2px_2px_0_rgba(0,0,0,0.8)]">
                    {selectedPlayer.gold?.toLocaleString() || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 土地网格 */}
          <div
            className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#292524] min-h-0 relative shadow-[inset_0_10px_30px_rgba(0,0,0,0.3)]"
            style={{
              backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }}
          >

            {/* 顶部统计 */}
            <div className="flex items-center justify-between mb-4 relative z-10 overflow-x-auto pb-2 sm:pb-0">
              <div className="flex items-center gap-2 text-xs font-bold text-[#78716c] uppercase tracking-widest font-mono flex-shrink-0">
                <Leaf className="w-3 h-3" />
                <span>{t('viewport.fieldMatrix')}</span>
              </div>

              <div className="flex gap-2 flex-nowrap">

                <MiniStat label={t('status.idle')} value={selectedPlayer.lands.filter((l) => l.status === "empty").length} color="text-stone-300" bg="bg-stone-700" />
                <MiniStat label={t('status.grow')} value={selectedPlayer.lands.filter((l) => l.status === "planted").length} color="text-blue-200" bg="bg-blue-900" />
                <MiniStat
                  label={t('status.care')}
                  value={selectedPlayer.lands.filter((l) => l.status !== "withered" && (l.hasWeeds || l.hasPests || l.needsWater)).length}
                  color="text-yellow-200"
                  bg="bg-yellow-900"
                />
                <MiniStat label={t('status.ripe')} value={selectedPlayer.lands.filter((l) => l.status === "harvestable").length} color="text-green-200" bg="bg-green-900" />
                <MiniStat label={t('status.dead')} value={selectedPlayer.lands.filter((l) => l.status === "withered").length} color="text-red-200" bg="bg-red-900" />

                <MiniStat
                  label={t('status.sec')}
                  value={secConfig.value}
                  color={secConfig.color}
                  bg={secConfig.bg}
                />
              </div>
            </div>

            {/* 网格容器 */}
            <div className="relative max-w-2xl mx-auto pb-10">
              <PatrolDog isActive={isDogActive} isDebug={debugMode} />

              <div className="grid grid-cols-3 gap-6 relative z-10">
                {Array.from({ length: TOTAL_LAND_SLOTS }).map((_, index) => {
                  const land = selectedPlayer.lands.find(l => l.position === index);
                  return (
                    <LandTile
                      key={land ? land.id : `locked-${index}`}
                      land={land}
                      locked={!land}
                      onUpdate={onRefresh}
                      isOwner={isOwner}
                      ownerId={selectedPlayer.id}
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
          <p className="tracking-widest text-xs">{t('viewport.selectUnit')}</p>
        </div>
      )}
    </section>
  );
}