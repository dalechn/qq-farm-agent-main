/**
 * QQ Farm Dashboard - Mission Control Style
 * 设计风格：深色科技感监控界面
 * 
 * 布局：
 * - 顶部：全局状态栏
 * - 左侧：玩家列表
 * - 中央：选中玩家的农场详情
 * - 右侧：实时日志
 * 
 * 现已连接真实后端 API，支持 WebSocket 实时更新
 */

import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Sprout, 
  Coins, 
  Star, 
  Activity,
  Users,
  Leaf,
  Timer,
  CheckCircle2,
  Circle,
  Loader2,
  Wifi,
  WifiOff,
  RefreshCw,
  Skull
} from "lucide-react";
import { useGameData } from "@/hooks/useGameData";
import type { Player, ActionLog } from "@/lib/api";

// 作物配置
const CROPS: Record<string, { name: string; emoji: string; color: string }> = {
  radish: { name: "白萝卜", emoji: "🥬", color: "text-green-400" },
  carrot: { name: "胡萝卜", emoji: "🥕", color: "text-orange-400" },
  corn: { name: "玉米", emoji: "🌽", color: "text-yellow-400" },
  strawberry: { name: "草莓", emoji: "🍓", color: "text-pink-400" },
  watermelon: { name: "西瓜", emoji: "🍉", color: "text-red-400" },
};

export default function Home() {
  const { players, logs, stats, isLoading, error, isConnected, refresh } = useGameData();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // 更新时间
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 当玩家列表更新时，更新选中的玩家
  useEffect(() => {
    if (players.length > 0) {
      if (!selectedPlayer) {
        setSelectedPlayer(players[0]);
      } else {
        // 更新选中玩家的数据
        const updated = players.find(p => p.id === selectedPlayer.id);
        if (updated) {
          setSelectedPlayer(updated);
        }
      }
    }
  }, [players, selectedPlayer]);

  // 格式化日志
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
      <div className="min-h-screen bg-background grid-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading farm data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background grid-bg">
      {/* 扫描线效果 */}
      <div className="fixed inset-0 scanline pointer-events-none z-50" />

      {/* 顶部状态栏 */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center glow-cyan">
                <Sprout className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">QQ Farm Control</h1>
                <p className="text-xs text-muted-foreground font-mono">Agent Monitoring System v2.0</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <StatBadge icon={<Users className="w-4 h-4" />} label="Agents" value={stats.totalPlayers} />
              <StatBadge icon={<Coins className="w-4 h-4" />} label="Total Gold" value={stats.totalGold.toLocaleString()} color="text-yellow-400" />
              <StatBadge icon={<Star className="w-4 h-4" />} label="Total EXP" value={stats.totalExp.toLocaleString()} color="text-purple-400" />
              <StatBadge icon={<CheckCircle2 className="w-4 h-4" />} label="Harvestable" value={stats.harvestableCount} color="text-green-400" />
              
              <div className="flex items-center gap-2 pl-4 border-l border-border">
                {isConnected ? (
                  <Wifi className="w-4 h-4 text-green-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-400" />
                )}
                <Activity className="w-4 h-4 text-green-400 animate-pulse" />
                <span className="font-mono text-sm">{currentTime.toLocaleTimeString()}</span>
                <button onClick={refresh} className="p-1 hover:bg-muted rounded">
                  <RefreshCw className="w-4 h-4 text-muted-foreground hover:text-primary" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 错误提示 */}
      {error && (
        <div className="container py-2">
          <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3 text-destructive text-sm">
            ⚠️ {error} - 请确保后端服务已启动
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <main className="container py-6">
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
          {/* 左侧：玩家列表 */}
          <aside className="col-span-3">
            <Card className="h-full bg-card/50 border-border/50 backdrop-blur">
              <div className="p-4 border-b border-border/50">
                <h2 className="font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Active Agents
                  <Badge variant="outline" className="ml-auto">{players.length}</Badge>
                </h2>
              </div>
              <ScrollArea className="h-[calc(100%-60px)]">
                <div className="p-3 space-y-2">
                  {players.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">暂无玩家</p>
                  ) : (
                    players.map((player) => (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        isSelected={selectedPlayer?.id === player.id}
                        onClick={() => setSelectedPlayer(player)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>
          </aside>

          {/* 中央：农场详情 */}
          <section className="col-span-6">
            {selectedPlayer ? (
              <FarmDetail player={selectedPlayer} />
            ) : (
              <Card className="h-full bg-card/50 border-border/50 flex items-center justify-center">
                <p className="text-muted-foreground">Select an agent to view farm details</p>
              </Card>
            )}
          </section>

          {/* 右侧：实时日志 */}
          <aside className="col-span-3">
            <Card className="h-full bg-card/50 border-border/50 backdrop-blur">
              <div className="p-4 border-b border-border/50">
                <h2 className="font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-green-400" />
                  Live Activity
                  {isConnected && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
                </h2>
              </div>
              <ScrollArea className="h-[calc(100%-60px)]">
                <div className="p-3 space-y-2">
                  {formattedLogs.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8 text-sm">等待活动...</p>
                  ) : (
                    formattedLogs.map((log) => (
                      <LogItem key={log.id} log={log} />
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}

// 统计徽章组件
function StatBadge({ icon, label, value, color = "text-primary" }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={color}>{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-mono font-semibold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

// 玩家卡片组件
function PlayerCard({ player, isSelected, onClick }: { player: Player; isSelected: boolean; onClick: () => void }) {
  const harvestable = player.lands.filter((l) => l.status === "harvestable").length;
  const planted = player.lands.filter((l) => l.status === "planted").length;

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? "border-primary bg-primary/10 glow-cyan"
          : "border-border/50 bg-card/30 hover:border-primary/50 hover:bg-card/50"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">{player.name}</span>
        <Badge variant="outline" className="font-mono text-xs">
          Lv.{player.level}
        </Badge>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1 text-yellow-400">
          <Coins className="w-3 h-3" />
          {player.gold}
        </span>
        <span className="flex items-center gap-1 text-green-400">
          <CheckCircle2 className="w-3 h-3" />
          {harvestable}
        </span>
        <span className="flex items-center gap-1 text-blue-400">
          <Loader2 className="w-3 h-3" />
          {planted}
        </span>
      </div>
    </div>
  );
}

// 农场详情组件
function FarmDetail({ player }: { player: Player }) {
  return (
    <Card className="h-full bg-card/50 border-border/50 backdrop-blur overflow-hidden">
      {/* 玩家信息头部 */}
      <div className="p-4 border-b border-border/50 bg-gradient-to-r from-primary/10 to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{player.name}</h2>
            <p className="text-sm text-muted-foreground font-mono">ID: {player.id.slice(0, 8)}...</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">{player.gold}</p>
              <p className="text-xs text-muted-foreground">Gold</p>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-400">{player.exp}</p>
              <p className="text-xs text-muted-foreground">EXP</p>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">Lv.{player.level}</p>
              <p className="text-xs text-muted-foreground">Level</p>
            </div>
          </div>
        </div>
      </div>

      {/* 农场网格 */}
      <div className="p-6">
        <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
          <Leaf className="w-4 h-4" />
          FARM GRID
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {player.lands.map((land) => (
            <LandTile key={land.id} land={land} />
          ))}
        </div>
      </div>

      {/* 统计信息 */}
      <div className="p-4 border-t border-border/50 bg-muted/20">
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Empty"
            value={player.lands.filter((l) => l.status === "empty").length}
            icon={<Circle className="w-4 h-4" />}
            color="text-muted-foreground"
          />
          <StatCard
            label="Growing"
            value={player.lands.filter((l) => l.status === "planted").length}
            icon={<Loader2 className="w-4 h-4 animate-spin" />}
            color="text-blue-400"
          />
          <StatCard
            label="Ready"
            value={player.lands.filter((l) => l.status === "harvestable").length}
            icon={<CheckCircle2 className="w-4 h-4" />}
            color="text-green-400"
          />
        </div>
      </div>
    </Card>
  );
}

// 土地格子组件
interface LandProps {
  land: {
    id: number;
    position: number;
    status: string;
    cropType: string | null;
    matureAt: string | null;
    stolenCount?: number;
  };
}

function LandTile({ land }: LandProps) {
  const crop = land.cropType ? CROPS[land.cropType] : null;
  const [progress, setProgress] = useState(0);

  // 计算成熟进度
  useEffect(() => {
    if (land.status === 'planted' && land.matureAt) {
      const updateProgress = () => {
        const now = Date.now();
        const matureTime = new Date(land.matureAt!).getTime();
        // 假设种植时间为成熟时间减去作物成熟周期（这里简化处理）
        const plantedTime = matureTime - 60000; // 假设 60 秒
        const total = matureTime - plantedTime;
        const elapsed = now - plantedTime;
        const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
        setProgress(pct);
      };
      updateProgress();
      const interval = setInterval(updateProgress, 1000);
      return () => clearInterval(interval);
    }
  }, [land.status, land.matureAt]);

  const statusStyles: Record<string, string> = {
    empty: "bg-muted/30 border-dashed border-muted-foreground/30",
    planted: "bg-blue-500/10 border-blue-500/50 glow-cyan",
    harvestable: "bg-green-500/10 border-green-500/50 glow-green animate-pulse-glow",
  };

  return (
    <div
      className={`aspect-square rounded-lg border-2 p-3 flex flex-col items-center justify-center transition-all relative ${statusStyles[land.status] || statusStyles.empty}`}
    >
      {/* 被偷标记 */}
      {land.stolenCount && land.stolenCount > 0 && (
        <div className="absolute top-1 right-1 flex items-center gap-0.5">
          <Skull className="w-3 h-3 text-red-400" />
          <span className="text-[10px] text-red-400">{land.stolenCount}</span>
        </div>
      )}

      {land.status === "empty" ? (
        <span className="text-muted-foreground text-sm">Empty</span>
      ) : (
        <>
          <span className="text-3xl mb-1">{crop?.emoji}</span>
          <span className={`text-xs font-medium ${crop?.color}`}>{crop?.name}</span>
          {land.status === "planted" && (
            <div className="mt-2 w-full">
              <Progress value={progress} className="h-1" />
              <span className="text-[10px] text-muted-foreground font-mono mt-1 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                Growing...
              </span>
            </div>
          )}
          {land.status === "harvestable" && (
            <Badge variant="default" className="mt-2 text-[10px] bg-green-500/20 text-green-400 border-green-500/50">
              READY
            </Badge>
          )}
        </>
      )}
    </div>
  );
}

// 统计卡片组件
function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-card/30">
      <span className={color}>{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

// 日志项组件
interface LogItemProps {
  log: {
    id: string;
    time: string;
    player: string;
    action: string;
    details: string;
  };
}

function LogItem({ log }: LogItemProps) {
  const actionColors: Record<string, string> = {
    HARVEST: "text-green-400 bg-green-500/10",
    PLANT: "text-blue-400 bg-blue-500/10",
    LEVEL_UP: "text-purple-400 bg-purple-500/10",
    STEAL: "text-red-400 bg-red-500/10",
    JOIN: "text-cyan-400 bg-cyan-500/10",
  };

  return (
    <div className="p-2 rounded-lg bg-card/30 border border-border/30 text-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-xs text-muted-foreground">{log.time}</span>
        <Badge variant="outline" className={`text-[10px] ${actionColors[log.action] || ""}`}>
          {log.action}
        </Badge>
      </div>
      <p className="text-xs">
        <span className="text-primary font-medium">{log.player}</span>
        <span className="text-muted-foreground ml-2">{log.details}</span>
      </p>
    </div>
  );
}
