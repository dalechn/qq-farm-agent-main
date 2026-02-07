// src/components/LandTile.tsx

import { useEffect, useState } from "react";
import { Hand, Skull, Droplets, Bug, Sprout, Shovel, Zap, Lock } from "lucide-react";
import { Land, plant, harvest, careLand, shovelLand, useFertilizer, steal } from "../lib/api";

// ==========================================
// 1. 像素风 SVG 图标组件库
// ==========================================

// 通用：萌芽阶段
const IconSprout = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-sm" shapeRendering="crispEdges">
    <path d="M7 10h2v6H7z" fill="#8B4513" /> {/* 茎 */}
    <path d="M5 6h2v2H5zM9 6h2v2H9z" fill="#4ADE80" /> {/* 叶子 */}
    <path d="M7 8h2v2H7z" fill="#22C55E" /> {/* 中心 */}
  </svg>
);

// 通用：生长阶段
const IconGrowing = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-sm" shapeRendering="crispEdges">
    <path d="M7 9h2v7H7z" fill="#8B4513" />
    <path d="M4 5h3v3H4zM9 5h3v3H9z" fill="#4ADE80" />
    <path d="M6 8h4v2H6z" fill="#22C55E" />
    <path d="M3 4h2v2H3zM11 4h2v2H11z" fill="#86EFAC" />
  </svg>
);

// 作物：白萝卜 (Radish)
const IconRadish = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M5 1h2v3H5zM9 1h2v3H9zM7 3h2v2H7z" fill="#4ADE80" />
    <path d="M4 5h8v5H4z" fill="#F8FAFC" />
    <path d="M5 10h6v3H5z" fill="#E2E8F0" />
    <path d="M7 13h2v2H7z" fill="#CBD5E1" />
  </svg>
);

// 作物：胡萝卜 (Carrot)
const IconCarrot = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M6 0h4v3H6z" fill="#22C55E" />
    <path d="M4 3h8v4H4z" fill="#F97316" />
    <path d="M5 7h6v5H5z" fill="#EA580C" />
    <path d="M7 12h2v3H7z" fill="#C2410C" />
  </svg>
);

// 作物：土豆 (Potato)
const IconPotato = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M6 2h4v3H6z" fill="#15803D" />
    <path d="M4 5h8v6H4z" fill="#D4A373" />
    <path d="M5 6h1v1H5zM9 7h1v1H9zM6 9h1v1H6z" fill="#BC8A5F" />
    <path d="M5 11h6v2H5z" fill="#A97142" />
  </svg>
);

// 作物：玉米 (Corn)
const IconCorn = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M5 2h6v12H5z" fill="#FACC15" />
    <path d="M6 3h1v1H6zM8 3h1v1H8zM10 3h1v1H10z" fill="#FEF08A" />
    <path d="M6 5h1v1H6zM8 5h1v1H8zM10 5h1v1H10z" fill="#FEF08A" />
    <path d="M6 7h1v1H6zM8 7h1v1H8zM10 7h1v1H10z" fill="#FEF08A" />
    <path d="M3 8h3v8H3z" fill="#22C55E" />
    <path d="M10 8h3v8H10z" fill="#22C55E" />
  </svg>
);

// 作物：草莓 (Strawberry)
const IconStrawberry = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M5 3h6v2H5z" fill="#22C55E" />
    <path d="M4 5h8v4H4z" fill="#EF4444" />
    <path d="M5 9h6v3H5z" fill="#DC2626" />
    <path d="M7 12h2v2H7z" fill="#991B1B" />
    <path d="M6 6h1v1H6zM9 6h1v1H9zM7 8h1v1H7zM5 10h1v1H5zM10 10h1v1H10z" fill="#FECACA" />
  </svg>
);

// 作物：番茄 (Tomato)
const IconTomato = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M7 2h2v2H7z" fill="#15803D" />
    <path d="M5 4h6v2H5z" fill="#DC2626" />
    <path d="M4 6h8v6H4z" fill="#EF4444" />
    <path d="M5 12h6v2H5z" fill="#B91C1C" />
    <path d="M6 7h2v2H6z" fill="#FECACA" opacity="0.3" />
  </svg>
);

// 作物：西瓜 (Watermelon)
const IconWatermelon = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M3 4h10v9H3z" fill="#22C55E" />
    <path d="M5 4h2v9H5z" fill="#14532D" opacity="0.8" />
    <path d="M9 4h2v9H9z" fill="#14532D" opacity="0.8" />
    <path d="M7 2h2v2H7z" fill="#8B4513" />
  </svg>
);

// 作物：南瓜 (Pumpkin)
const IconPumpkin = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M7 2h2v2H7z" fill="#5D4037" />
    <path d="M4 4h8v8H4z" fill="#F97316" />
    <path d="M3 5h2v6H3zM11 5h2v6H11z" fill="#EA580C" />
    <path d="M6 5h1v7H6zM9 5h1v7H9z" fill="#C2410C" opacity="0.5" />
  </svg>
);

const CROP_COMPONENTS: Record<string, any> = {
  radish: IconRadish,
  carrot: IconCarrot,
  potato: IconPotato,
  corn: IconCorn,
  strawberry: IconStrawberry,
  tomato: IconTomato,
  watermelon: IconWatermelon,
  pumpkin: IconPumpkin,
};

const CROP_CONFIG: Record<string, { color: string; name: string }> = {
  radish: { color: "text-slate-200", name: "Radish" },
  carrot: { color: "text-orange-300", name: "Carrot" },
  potato: { color: "text-yellow-600", name: "Potato" },
  corn: { color: "text-yellow-300", name: "Corn" },
  strawberry: { color: "text-red-300", name: "Berry" },
  tomato: { color: "text-red-500", name: "Tomato" },
  watermelon: { color: "text-green-300", name: "Melon" },
  pumpkin: { color: "text-orange-500", name: "Pumpkin" },
};

interface LandProps {
  land?: Land;
  locked?: boolean;
  selectedCrop?: string | null;
  onUpdate?: () => void;
  isOwner?: boolean; // [新增]
  ownerId?: string;  // [新增]
}

export function LandTile({ land, locked, selectedCrop, onUpdate, isOwner = false, ownerId }: LandProps) {
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  // [修复] 兼容后端可能返回的 cropId 或 cropType
  // @ts-ignore
  const currentCropId = land?.cropId || land?.cropType;

  // 1. 计算生长进度
  useEffect(() => {
    if (!land) return;

    if (land.status === 'planted' && land.matureAt) {
      const updateProgress = () => {
        const now = Date.now();
        const matureTime = new Date(land.matureAt!).getTime();
        const plantedTime = new Date(land.plantedAt!).getTime();
        const totalDuration = matureTime - plantedTime;

        if (totalDuration <= 0) {
          setProgress(100);
          return;
        }

        const elapsed = now - plantedTime;
        const pct = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
        setProgress(pct);
      };

      updateProgress();
      const interval = setInterval(updateProgress, 1000);
      return () => clearInterval(interval);
    } else if (land.status === 'harvestable') {
      setProgress(100);
    } else {
      setProgress(0);
    }
  }, [land]);

  if (locked) {
    return (
      <div
        className="
          aspect-square relative 
          border-2 border-dashed border-stone-800/50 
          bg-stone-900/30 
          flex flex-col items-center justify-center 
          select-none
        "
      >
        <Lock className="w-6 h-6 text-stone-700/50" />
      </div>
    );
  }

  if (!land) return null;

  const isMature = land.status === 'harvestable' || (land.status === 'planted' && progress >= 100);

  // 2. 交互处理
  const handleClick = async () => {
    if (loading) return;

    try {
      setLoading(true);

      // --- 主人模式 ---
      if (isOwner) {
        if (land.status === 'empty' && selectedCrop) {
          await plant(land.position, selectedCrop);
          onUpdate?.();
        } else if (land.status === 'harvestable' || isMature) {
          await harvest(land.position);
          onUpdate?.();
        } else if (land.status === 'withered') {
          await shovelLand(land.position);
          onUpdate?.();
        }
      }
      // --- 访客模式 (偷菜) ---
      else if (ownerId) {
        if (land.status === 'harvestable' || isMature) {
          // 偷菜
          const res = await steal(ownerId, land.position);
          if (res.success) {
            alert(`Stole ${res.stolen.amount} ${res.stolen.cropName}!`);
            onUpdate?.();
          } else if (res.penalty) {
            alert(`Bitten by dog! Lost ${res.penalty} gold.`);
            onUpdate?.();
          } else {
            alert(res.reason || 'Failed to steal');
          }
        } else {
          // 访客点击其他状态不做操作 (防止误把自己的种子种别人地里)
          console.log("Visitor action restricted");
        }
      }

    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCare = async (e: React.MouseEvent, type: 'water' | 'weed' | 'pest') => {
    e.stopPropagation();
    if (loading) return;
    try {
      setLoading(true);
      // 如果不是主人，传入 targetId (ownerId)
      await careLand(land.position, type, isOwner ? undefined : ownerId);
      onUpdate?.();
    } catch (error) {
      console.error('Care failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShovel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // if (!isOwner) return; // 移除: 允许访客铲除
    if (loading) return;
    try {
      setLoading(true);
      // 如果是访客，传入 targetId (ownerId)
      await shovelLand(land.position, isOwner ? undefined : ownerId);
      onUpdate?.(); // 铲除成功 -> 刷新
    } catch (error) {
      console.error('Shovel failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFertilize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOwner) return; // 访客不可施肥
    if (loading) return;
    try {
      setLoading(true);
      await useFertilizer(land.position, 'normal');
      onUpdate?.(); // 施肥成功 -> 刷新
    } catch (error) {
      console.error('Fertilizer failed:', error);
      alert('Fertilizer failed: No inventory');
    } finally {
      setLoading(false);
    }
  };

  // 3. 渲染图标
  const renderCropIcon = () => {
    // 枯萎状态
    if (land.status === 'withered') {
      const Icon = currentCropId ? CROP_COMPONENTS[currentCropId] : IconSprout;
      return (
        <div className="grayscale opacity-60">
          {Icon && <Icon />}
        </div>
      );
    }

    // 成熟状态
    if (isMature) {
      const Icon = currentCropId ? CROP_COMPONENTS[currentCropId] : IconRadish;
      return Icon ? <Icon /> : null;
    }

    // 生长中
    if (progress < 30) return <IconSprout />;
    if (progress < 80) return <IconGrowing />;

    // 接近成熟 (显示原图但小一点或正常)
    const Icon = currentCropId ? CROP_COMPONENTS[currentCropId] : IconRadish;
    return Icon ? <Icon /> : null;
  };

  // 4. 动态样式
  const getLandStyle = () => {
    if (land.status === 'withered') {
      return "bg-stone-600 border-stone-800 opacity-100";
    }

    if (isMature) {
      // 偷菜模式下，高亮显示可偷
      const borderClass = !isOwner ? "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]" : "border-[#fbbf24] shadow-[0_0_15px_rgba(251,191,36,0.4)]";
      return `bg-[#3f2e21] ${borderClass} z-10 scale-[1.02]`;
    }

    let styles = {
      bgEmpty: "bg-[#382e2c]",
      bgPlanted: "bg-[#271c19]",
      border: "border-[#443632]"
    };

    switch (land.landType) {
      case 'red':
        styles = {
          bgEmpty: "bg-[#7f1d1d]",
          bgPlanted: "bg-[#450a0a]",
          border: "border-[#991b1b]"
        };
        break;
      case 'black':
        styles = {
          bgEmpty: "bg-[#292524]",
          bgPlanted: "bg-[#0a0a0a]",
          border: "border-[#57534e]"
        };
        break;
      case 'gold':
        styles = {
          bgEmpty: "bg-[#a16207]",
          bgPlanted: "bg-[#422006]",
          border: "border-[#facc15] shadow-[inset_0_0_10px_rgba(250,204,21,0.3)]"
        };
        break;
      case 'normal':
      default:
        break;
    }

    if (land.status === 'planted') {
      return `${styles.bgPlanted} ${styles.border}`;
    } else {
      const baseClasses = `${styles.bgEmpty} ${styles.border}`;
      if (selectedCrop && isOwner) { // 仅主人选种时高亮
        return `${baseClasses} opacity-100 ring-2 ring-green-500/50 cursor-pointer`;
      } else {
        // 简化: 访客看空地不显示 hover 效果
        return `${baseClasses} ${isOwner ? 'opacity-90 hover:opacity-100 hover:brightness-110 transition-all' : 'opacity-90'}`;
      }
    }
  };

  const cropName = currentCropId ? CROP_CONFIG[currentCropId]?.name : '';

  // 辅助渲染: 操作按钮覆盖层
  const renderActions = () => {
    // 访客不能操作施肥等，只有照料
    return (
      <div className="absolute inset-0 flex items-center justify-center gap-1 z-30">
        {land.needsWater && (
          <button onClick={(e) => handleCare(e, 'water')} className="bg-blue-500 hover:bg-blue-600 p-1 rounded-full shadow-lg animate-pulse" title="Water">
            <Droplets className="w-3 h-3 text-white" />
          </button>
        )}
        {land.hasWeeds && (
          <button onClick={(e) => handleCare(e, 'weed')} className="bg-green-600 hover:bg-green-700 p-1 rounded-full shadow-lg animate-pulse" title="Weed">
            <Sprout className="w-3 h-3 text-white" />
          </button>
        )}
        {land.hasPests && (
          <button onClick={(e) => handleCare(e, 'pest')} className="bg-red-500 hover:bg-red-600 p-1 rounded-full shadow-lg animate-pulse" title="Pest">
            <Bug className="w-3 h-3 text-white" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className={`
        aspect-square relative 
        border-2 
        transition-all duration-300
        group 
        ${(isOwner || (!isOwner && isMature)) ? 'cursor-pointer' : 'cursor-default'}
        flex flex-col items-center justify-center
        select-none
        ${getLandStyle()}
      `}
      onClick={handleClick}
    >
      <div className="absolute inset-0 border-t-2 border-l-2 border-white/5 pointer-events-none"></div>

      <div className="absolute -top-3 -right-3 z-20 flex flex-col gap-1 items-end">
        {land.stolenCount > 0 && (
          <div className="bg-red-600 border border-black text-white px-1.5 py-0.5 text-[8px] font-bold font-mono shadow-sm animate-bounce">
            <div className="flex items-center gap-0.5">
              <Skull className="w-2 h-2" />
              <span>-{land.stolenCount}</span>
            </div>
          </div>
        )}
      </div>

      <div className="relative w-full h-full flex flex-col items-center justify-center p-2">

        {land.status === 'empty' ? (
          <div className="text-[#57534e] transition-colors">
            {loading ? (
              <div className="w-4 h-4 border-2 border-t-transparent border-white/50 rounded-full animate-spin"></div>
            ) : (
              isOwner && <div className="text-4xl font-thin leading-none group-hover:text-[#a8a29e]">+</div>
            )}
          </div>
        ) : (
          <>
            {(isOwner || (ownerId && land.status === 'withered')) && land.status === 'withered' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                <button onClick={handleShovel} className="bg-stone-700 hover:bg-red-600 text-white p-1.5 rounded-full border border-stone-500 shadow-lg transition-colors">
                  <Shovel className="w-5 h-5" />
                </button>
              </div>
            )}

            {land.status === 'withered' && (
              <div className="absolute bottom-1 z-30 text-[8px] text-red-400 font-mono bg-black/60 px-2 py-0.5">
                WITHERED
              </div>
            )}

            <div className={`w-12 h-12 sm:w-14 sm:h-14 transition-transform duration-500 relative ${isMature ? 'animate-bounce-slow' : 'scale-90 group-hover:scale-100'}`}>
              {renderCropIcon()}
              {!isMature && land.status === 'planted' && renderActions()}
            </div>

            <div className="absolute bottom-1 w-full px-2 flex flex-col items-center z-10">

              {!isMature && land.status !== 'withered' && (
                <>
                  <div className="w-full h-1.5 bg-black/50 border border-white/10 p-[1px] mb-0.5">
                    <div
                      className="h-full bg-green-500 transition-all duration-1000 ease-linear"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {land.remainingHarvests > 1 && (
                    <div className="text-[8px] text-yellow-200 font-mono scale-75 origin-bottom">
                      {land.remainingHarvests} harvests left
                    </div>
                  )}
                </>
              )}

              {isMature && (
                <div className={`text-black text-[8px] px-2 py-0.5 font-bold font-mono border border-black shadow-sm tracking-wide ${!isOwner ? 'bg-red-500 text-white' : 'bg-yellow-500/90'}`}>
                  {!isOwner ? 'STEAL' : 'HARVEST'}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {land.status !== 'empty' && (
        <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-1 py-0.5 rounded text-[8px] font-mono text-white pointer-events-none z-30">
          {cropName}
        </div>
      )}
    </div>
  );
}