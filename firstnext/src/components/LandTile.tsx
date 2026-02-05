import { useEffect, useState, useMemo } from "react";
import { Skull, Droplets } from "lucide-react";

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

// 作物：西瓜 (Watermelon)
const IconWatermelon = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M3 4h10v9H3z" fill="#22C55E" />
    <path d="M5 4h2v9H5z" fill="#14532D" opacity="0.8" />
    <path d="M9 4h2v9H9z" fill="#14532D" opacity="0.8" />
    <path d="M7 2h2v2H7z" fill="#8B4513" />
  </svg>
);

const CROP_COMPONENTS: Record<string, any> = {
  radish: IconRadish,
  carrot: IconCarrot,
  corn: IconCorn,
  strawberry: IconStrawberry,
  watermelon: IconWatermelon,
};

const CROP_CONFIG: Record<string, { color: string; name: string }> = {
  radish: { color: "text-slate-200", name: "Radish" },
  carrot: { color: "text-orange-300", name: "Carrot" },
  corn: { color: "text-yellow-300", name: "Corn" },
  strawberry: { color: "text-red-300", name: "Berry" },
  watermelon: { color: "text-green-300", name: "Melon" },
};

export function LandTile({ land }: { land: any }) {
  const [progress, setProgress] = useState(0);
  
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

  // [修改点] 核心状态判断：只要是 'harvestable' 或者 进度条满了，都视为成熟
  const isMature = land.status === 'harvestable' || (land.status === 'planted' && progress >= 100);

  // 2. 根据进度决定渲染哪个图标
  const renderCropIcon = () => {
    if (isMature) {
      const Icon = CROP_COMPONENTS[land.cropType] || IconRadish;
      return <Icon />;
    }
    
    if (progress < 30) return <IconSprout />;
    if (progress < 80) return <IconGrowing />;
    
    // 80%~99% 显示成熟图标但没特效
    const Icon = CROP_COMPONENTS[land.cropType] || IconRadish;
    return <Icon />;
  };

  // 3. 动态样式计算
  const getLandStyle = () => {
    if (isMature) {
        // 成熟时：金边，土地颜色变深，有光晕
        return "bg-[#3f2e21] border-[#fbbf24] shadow-[0_0_15px_rgba(251,191,36,0.4)] z-10 scale-[1.02]";
    }
    
    switch (land.status) {
      case 'planted':
        return "bg-[#271c19] border-[#443632]"; 
      case 'empty':
      default:
        return "bg-[#382e2c] border-[#292524] opacity-80 hover:opacity-100 hover:border-[#57534e]"; 
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
        ${getLandStyle()}
      `}
    >
      {/* 像素化内阴影 */}
      <div className="absolute inset-0 border-t-2 border-l-2 border-white/5 pointer-events-none"></div>

      {/* 偷菜标记 */}
      {land.stolenCount > 0 && (
        <div className="absolute -top-2 -right-2 z-20 bg-red-600 border border-black text-white px-1.5 py-0.5 text-[8px] font-bold font-mono shadow-sm animate-bounce">
           <div className="flex items-center gap-0.5">
             <Skull className="w-2 h-2" />
             <span>-{land.stolenCount}</span>
           </div>
        </div>
      )}
      
      {/* 内容区域 */}
      <div className="relative w-full h-full flex flex-col items-center justify-center p-2">
        
        {land.status === 'empty' ? (
          <div className="text-[#57534e] group-hover:text-[#a8a29e] transition-colors">
            <div className="text-4xl font-thin leading-none select-none">+</div>
          </div>
        ) : (
          <>
            {/* 作物图标容器 */}
            <div className={`w-12 h-12 sm:w-14 sm:h-14 transition-transform duration-500 ${isMature ? 'animate-bounce-slow' : 'scale-90 group-hover:scale-100'}`}>
              {renderCropIcon()}
            </div>
            
            {/* 底部信息栏 */}
            <div className="absolute bottom-1 w-full px-2 flex flex-col items-center">
              
              {!isMature && (
                <>
                 {/* 生长进度条 */}
                 <div className="w-full h-1.5 bg-black/50 border border-white/10 p-[1px] mb-0.5">
                   <div 
                      className="h-full bg-green-500 transition-all duration-1000 ease-linear" 
                      style={{ width: `${progress}%` }} 
                   />
                 </div>
                 {/* 状态文字 */}
                 <div className="text-[8px] text-stone-400 font-mono flex items-center gap-1">
                   <Droplets className="w-2 h-2" />
                   {Math.floor(progress)}%
                 </div>
                </>
              )}

              {/* [修改点] 只要本地判断成熟，就显示 HARVEST */}
              {isMature && (
                <div className="bg-yellow-500/90 text-black text-[8px] px-2 py-0.5 font-bold font-mono border border-black shadow-sm tracking-wide">
                  HARVEST
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