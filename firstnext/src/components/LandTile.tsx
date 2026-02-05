import { useEffect, useState } from "react";
import { Skull, Droplets, Bug, Sprout, Shovel } from "lucide-react";
import { Land, plant, harvest, careLand, shovelLand } from "../lib/api";

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

// [新增] 作物：土豆 (Potato)
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

// [新增] 作物：番茄 (Tomato)
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

// [新增] 作物：南瓜 (Pumpkin)
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
  land: Land;
  selectedCrop?: string | null;
  onUpdate?: () => void;
}

export function LandTile({ land, selectedCrop, onUpdate }: LandProps) {
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // 1. 计算生长进度
  useEffect(() => {
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

  const isMature = land.status === 'harvestable' || (land.status === 'planted' && progress >= 100);

  // 2. 交互处理
  const handleClick = async () => {
    if (loading) return;

    try {
      setLoading(true);
      if (land.status === 'empty' && selectedCrop) {
        await plant(land.position, selectedCrop);
        onUpdate?.();
      } else if (land.status === 'harvestable' || isMature) {
        await harvest(land.position);
        onUpdate?.();
      } else if (land.status === 'withered') {
        // 点击枯萎土地也可以铲除
        await shovelLand(land.position);
        onUpdate?.();
      }
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCare = async (e: React.MouseEvent, type: 'water' | 'weed' | 'pest') => {
    e.stopPropagation(); // 阻止冒泡，不触发点击土地
    if (loading) return;
    try {
      setLoading(true);
      await careLand(land.position, type);
      onUpdate?.();
    } catch (error) {
      console.error('Care failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShovel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    try {
      setLoading(true);
      await shovelLand(land.position);
      onUpdate?.();
    } catch (error) {
      console.error('Shovel failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // 3. 渲染图标
  const renderCropIcon = () => {
    // 枯萎状态
    if (land.status === 'withered') {
      const Icon = land.cropType ? CROP_COMPONENTS[land.cropType] : IconSprout;
      return (
        <div className="grayscale opacity-60">
           {Icon && <Icon />}
        </div>
      );
    }

    if (isMature) {
      const Icon = land.cropType ? CROP_COMPONENTS[land.cropType] : IconRadish;
      return Icon ? <Icon /> : null;
    }
    
    if (progress < 30) return <IconSprout />;
    if (progress < 80) return <IconGrowing />;
    
    const Icon = land.cropType ? CROP_COMPONENTS[land.cropType] : IconRadish;
    return Icon ? <Icon /> : null;
  };

  // 4. 动态样式
  const getLandStyle = () => {
    if (land.status === 'withered') {
      return "bg-stone-600 border-stone-800"; // 枯萎灰暗色
    }
    if (isMature) {
        return "bg-[#3f2e21] border-[#fbbf24] shadow-[0_0_15px_rgba(251,191,36,0.4)] z-10 scale-[1.02]";
    }
    switch (land.status) {
      case 'planted':
        return "bg-[#271c19] border-[#443632]"; 
      case 'empty':
      default:
        // 如果选中了作物，empty 状态高亮一下表示可种
        return selectedCrop 
          ? "bg-[#382e2c] border-[#292524] opacity-100 ring-2 ring-green-500/50" 
          : "bg-[#382e2c] border-[#292524] opacity-80 hover:opacity-100 hover:border-[#57534e]"; 
    }
  };

  const cropName = land.cropType ? CROP_CONFIG[land.cropType]?.name : '';

  return (
    <div 
      className={`
        aspect-square relative 
        border-2 
        transition-all duration-300
        group cursor-pointer
        flex flex-col items-center justify-center
        select-none
        ${getLandStyle()}
      `}
      onClick={handleClick}
    >
      {/* 像素化内阴影 */}
      <div className="absolute inset-0 border-t-2 border-l-2 border-white/5 pointer-events-none"></div>

      {/* 偷菜/灾害标记容器 */}
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
      
      {/* 内容区域 */}
      <div className="relative w-full h-full flex flex-col items-center justify-center p-2">
        
        {land.status === 'empty' ? (
          <div className="text-[#57534e] group-hover:text-[#a8a29e] transition-colors">
             {loading ? (
                <div className="w-4 h-4 border-2 border-t-transparent border-white/50 rounded-full animate-spin"></div>
             ) : (
                <div className="text-4xl font-thin leading-none">+</div>
             )}
          </div>
        ) : (
          <>
            {/* 枯萎遮罩层 */}
            {land.status === 'withered' && (
               <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                  <button
                    onClick={handleShovel}
                    className="bg-stone-700 hover:bg-red-600 text-white p-1.5 rounded-full border border-stone-500 shadow-lg transition-colors group/shovel"
                    title="铲除枯萎作物"
                  >
                    <Shovel className="w-5 h-5 group-hover/shovel:animate-wiggle" />
                  </button>
               </div>
            )}

            {/* 作物图标容器 */}
            <div className={`w-12 h-12 sm:w-14 sm:h-14 transition-transform duration-500 relative ${isMature ? 'animate-bounce-slow' : 'scale-90 group-hover:scale-100'}`}>
              {renderCropIcon()}

              {/* [新增] 灾害浮层按钮 (仅在生长中显示) */}
              {!isMature && land.status === 'planted' && (
                <div className="absolute inset-0 flex items-center justify-center gap-1 z-30">
                  {land.needsWater && (
                    <button onClick={(e) => handleCare(e, 'water')} className="bg-blue-500 hover:bg-blue-600 p-1 rounded-full shadow-lg animate-pulse" title="浇水">
                      <Droplets className="w-3 h-3 text-white" />
                    </button>
                  )}
                  {land.hasWeeds && (
                    <button onClick={(e) => handleCare(e, 'weed')} className="bg-green-600 hover:bg-green-700 p-1 rounded-full shadow-lg animate-pulse" title="除草">
                      <Sprout className="w-3 h-3 text-white" />
                    </button>
                  )}
                  {land.hasPests && (
                    <button onClick={(e) => handleCare(e, 'pest')} className="bg-red-500 hover:bg-red-600 p-1 rounded-full shadow-lg animate-pulse" title="除虫">
                      <Bug className="w-3 h-3 text-white" />
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {/* 底部信息栏 */}
            <div className="absolute bottom-1 w-full px-2 flex flex-col items-center z-10">
              
              {!isMature && land.status !== 'withered' && (
                <>
                 <div className="w-full h-1.5 bg-black/50 border border-white/10 p-[1px] mb-0.5">
                   <div 
                      className="h-full bg-green-500 transition-all duration-1000 ease-linear" 
                      style={{ width: `${progress}%` }} 
                   />
                 </div>
                 {/* 剩余几季显示 */}
                 {land.remainingHarvests > 1 && (
                    <div className="text-[8px] text-yellow-200 font-mono scale-75 origin-bottom">
                       剩余 {land.remainingHarvests} 季
                    </div>
                 )}
                </>
              )}

              {isMature && (
                <div className="bg-yellow-500/90 text-black text-[8px] px-2 py-0.5 font-bold font-mono border border-black shadow-sm tracking-wide">
                  HARVEST
                </div>
              )}
              
              {land.status === 'withered' && (
                <div className="text-[8px] text-red-400 font-mono bg-black/50 px-1 rounded">
                   WITHERED
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 名字悬浮提示 */}
      {land.status !== 'empty' && (
         <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-1 py-0.5 rounded text-[8px] font-mono text-white pointer-events-none z-30">
            {cropName}
         </div>
      )}
    </div>
  );
}