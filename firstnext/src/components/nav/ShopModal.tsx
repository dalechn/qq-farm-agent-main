import {
  X,
  ShoppingBasket,
  Clock,
  TrendingUp,
  Layers,
  RefreshCw,
  MapPin,
  Coins,
  Sprout
} from "lucide-react";
import { type Crop } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// ==========================================
// 1. 像素风 SVG 图标库 (与 LandTile 风格保持一致)
// ==========================================

// 通用占位
const IconSeed = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-sm" shapeRendering="crispEdges">
    <path d="M6 8h4v5H6z" fill="#A8A29E" />
    <path d="M4 10h2v3H4zM10 10h2v3H10z" fill="#78716C" />
    <path d="M5 11h1v1H5z" fill="#D6D3D1" />
  </svg>
);

const IconRadish = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M5 1h2v3H5zM9 1h2v3H9zM7 3h2v2H7z" fill="#4ADE80" />
    <path d="M4 5h8v5H4z" fill="#F8FAFC" />
    <path d="M5 10h6v3H5z" fill="#E2E8F0" />
    <path d="M7 13h2v2H7z" fill="#CBD5E1" />
  </svg>
);

const IconCarrot = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M6 0h4v3H6z" fill="#22C55E" />
    <path d="M4 3h8v4H4z" fill="#F97316" />
    <path d="M5 7h6v5H5z" fill="#EA580C" />
    <path d="M7 12h2v3H7z" fill="#C2410C" />
  </svg>
);

const IconPotato = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M6 2h4v3H6z" fill="#15803D" />
    <path d="M4 5h8v6H4z" fill="#D4A373" />
    <path d="M5 6h1v1H5zM9 7h1v1H9zM6 9h1v1H6z" fill="#BC8A5F" />
    <path d="M5 11h6v2H5z" fill="#A97142" />
  </svg>
);

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

const IconStrawberry = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M5 3h6v2H5z" fill="#22C55E" />
    <path d="M4 5h8v4H4z" fill="#EF4444" />
    <path d="M5 9h6v3H5z" fill="#DC2626" />
    <path d="M7 12h2v2H7z" fill="#991B1B" />
    <path d="M6 6h1v1H6zM9 6h1v1H9zM7 8h1v1H7zM5 10h1v1H5zM10 10h1v1H10z" fill="#FECACA" />
  </svg>
);

const IconTomato = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M7 2h2v2H7z" fill="#15803D" />
    <path d="M5 4h6v2H5z" fill="#DC2626" />
    <path d="M4 6h8v6H4z" fill="#EF4444" />
    <path d="M5 12h6v2H5z" fill="#B91C1C" />
    <path d="M6 7h2v2H6z" fill="#FECACA" opacity="0.3" />
  </svg>
);

const IconWatermelon = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M3 4h10v9H3z" fill="#22C55E" />
    <path d="M5 4h2v9H5z" fill="#14532D" opacity="0.8" />
    <path d="M9 4h2v9H9z" fill="#14532D" opacity="0.8" />
    <path d="M7 2h2v2H7z" fill="#8B4513" />
  </svg>
);

const IconPumpkin = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M7 2h2v2H7z" fill="#5D4037" />
    <path d="M4 4h8v8H4z" fill="#F97316" />
    <path d="M3 5h2v6H3zM11 5h2v6H11z" fill="#EA580C" />
    <path d="M6 5h1v7H6zM9 5h1v7H9z" fill="#C2410C" opacity="0.5" />
  </svg>
);

// [新增] 茄子
const IconEggplant = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M7 1h2v3H7z" fill="#22C55E" />
    <path d="M5 4h6v2H5z" fill="#8B5CF6" />
    <path d="M4 6h8v6H4z" fill="#7C3AED" />
    <path d="M5 12h6v2H5z" fill="#5B21B6" />
    <path d="M6 6h1v2H6z" fill="#A78BFA" opacity="0.5" />
  </svg>
);

// [新增] 辣椒
const IconPepper = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M7 1h2v3H7z" fill="#15803D" />
    <path d="M5 4h6v2H5z" fill="#EF4444" />
    <path d="M4 6h8v5H4z" fill="#DC2626" />
    <path d="M6 11h4v3H6z" fill="#991B1B" />
  </svg>
);

// [新增] 菠萝
const IconPineapple = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M5 1h1v3H5zM7 0h2v4H7zM10 1h1v3H10z" fill="#22C55E" />
    <path d="M4 4h8v9H4z" fill="#FACC15" />
    <path d="M4 5h8v1H4zM4 7h8v1H4zM4 9h8v1H4zM4 11h8v1H4z" fill="#EAB308" opacity="0.5" />
  </svg>
);

// [新增] 葡萄
const IconGrape = () => (
  <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-md" shapeRendering="crispEdges">
    <path d="M7 1h2v2H7z" fill="#166534" />
    <path d="M5 3h6v3H5z" fill="#9333EA" />
    <path d="M4 6h8v3H4z" fill="#7E22CE" />
    <path d="M5 9h6v3H5z" fill="#6B21A8" />
    <path d="M7 12h2v2H7z" fill="#581C87" />
  </svg>
);

// 图标映射表
const CROP_ICONS: Record<string, React.ComponentType> = {
  radish: IconRadish,
  carrot: IconCarrot,
  corn: IconCorn,
  strawberry: IconStrawberry,
  watermelon: IconWatermelon,
  tomato: IconTomato,
  eggplant: IconEggplant,
  potato: IconPotato,
  pepper: IconPepper,
  pumpkin: IconPumpkin,
  pineapple: IconPineapple,
  grape: IconGrape,
  // 如果需要更多，可以继续扩展，未匹配的会显示种子图标
};

// 土地类型中文映射
const LAND_TYPE_NAMES: Record<string, string> = {
  normal: 'Normal',
  red: 'Red Soil',
  black: 'Black Soil',
  gold: 'Gold',
};

// 土地类型颜色映射（用于标签）
const LAND_TYPE_COLORS: Record<string, string> = {
  normal: 'bg-stone-700 text-stone-300',
  red: 'bg-red-900 text-red-200 border-red-700',
  black: 'bg-neutral-800 text-neutral-300 border-neutral-600',
  gold: 'bg-yellow-900 text-yellow-200 border-yellow-600',
};

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  crops: Crop[];
}

export function ShopModal({ isOpen, onClose, crops }: ShopModalProps) {
  const { t } = useI18n();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-mono p-4">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose} 
      />
      
      {/* 模态框主体 */}
      <div 
        className="relative w-full max-w-4xl bg-[#1c1917] border-2 border-[#44403c] shadow-[0_0_0_1px_rgba(0,0,0,0.5),8px_8px_0_0_#0c0a09] flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex-none h-14 border-b-2 border-[#44403c] bg-[#292524] flex items-center justify-between px-6 select-none">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-orange-600 border-b-4 border-r-4 border-orange-800 flex items-center justify-center shadow-sm rounded-sm">
               <ShoppingBasket className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <h2 className="font-bold text-lg text-stone-200 uppercase tracking-widest leading-none">{t('shop.title')}</h2>
              <span className="text-[10px] text-stone-500 mt-1">{t('shop.subtitle')}</span>
            </div>
          </div>

          {/* Close Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center bg-[#1c1917] border border-stone-600 text-stone-400 hover:text-white hover:bg-red-900/50 hover:border-red-500 transition-all rounded-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Content - Grid Layout */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#1c1917]">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {crops.map((crop) => {
               const yieldAmount = crop.yield || 1;
               const totalRevenue = crop.sellPrice * yieldAmount * crop.maxHarvests;
               const totalCost = crop.seedPrice;
               const netProfit = totalRevenue - totalCost;
               const isProfitable = netProfit >= 0;
               
               const CropIcon = CROP_ICONS[crop.type] || IconSeed;
               const landTypeColor = LAND_TYPE_COLORS[crop.requiredLandType || 'normal'] || LAND_TYPE_COLORS['normal'];

               return (
               <div key={crop.type} className="group relative bg-[#292524] border-2 border-[#44403c] hover:border-orange-500/50 hover:bg-[#322c2b] transition-all duration-200 shadow-sm flex flex-col">

                  {/* Card Header & Icon */}
                  <div className="flex p-3 gap-3">
                     <div className="w-16 h-16 bg-[#1c1917] border-2 border-[#44403c] flex items-center justify-center p-1 group-hover:border-orange-500/30 transition-colors">
                        <div className="w-full h-full animate-bounce-slow">
                           <CropIcon />
                        </div>
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                           <h3 className="font-bold text-stone-100 text-base truncate pr-2">{crop.name}</h3>
                           <span className={`text-[10px] px-1.5 py-0.5 border ${landTypeColor} rounded-[2px] font-bold uppercase`}>
                             {t(`land.${crop.requiredLandType || 'normal'}`)}
                           </span>
                        </div>
                        <div className="text-[10px] text-stone-500 font-mono mt-1">ID: {crop.type.toUpperCase()}</div>

                        {/* 简要收益概览 */}
                        <div className="mt-2 flex items-center gap-2">
                           <div className="flex items-center gap-1 text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded-[2px] border border-yellow-500/20">
                              <Coins className="w-3 h-3" />
                              <span className="font-bold text-xs">{crop.seedPrice}</span>
                           </div>
                           <div className="text-[10px] text-stone-500">→</div>
                           <div className={`text-[10px] font-bold ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                             {t('crop.netProfit')} {netProfit}
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Detailed Stats Grid */}
                  <div className="grid grid-cols-2 gap-px bg-[#44403c] border-y border-[#44403c] mx-0">
                      {/* 出售单价 */}
                      <div className="bg-[#262626] p-2 flex flex-col gap-1">
                         <span className="text-[9px] text-stone-500 uppercase tracking-wider">{t('crop.sellPrice')}</span>
                         <span className="text-stone-300 font-bold text-xs flex items-center gap-1">
                            <Coins className="w-3 h-3 text-stone-500" />
                            {crop.sellPrice} <span className="text-[9px] font-normal text-stone-600">{t('crop.perUnit')}</span>
                         </span>
                      </div>

                      {/* 单季产量 */}
                      <div className="bg-[#262626] p-2 flex flex-col gap-1">
                         <span className="text-[9px] text-stone-500 uppercase tracking-wider">{t('crop.yield')}</span>
                         <span className="text-blue-300 font-bold text-xs flex items-center gap-1">
                            <Layers className="w-3 h-3 text-blue-500/50" />
                            x{yieldAmount} <span className="text-[9px] font-normal text-stone-600">{t('crop.perSeason')}</span>
                         </span>
                      </div>

                      {/* 成熟时间 */}
                      <div className="bg-[#262626] p-2 flex flex-col gap-1">
                         <span className="text-[9px] text-stone-500 uppercase tracking-wider">{t('crop.growth')}</span>
                         <span className="text-stone-300 font-bold text-xs flex items-center gap-1">
                            <Clock className="w-3 h-3 text-stone-500" />
                            {crop.matureTime}s
                         </span>
                      </div>

                      {/* 经验值 */}
                      <div className="bg-[#262626] p-2 flex flex-col gap-1">
                         <span className="text-[9px] text-stone-500 uppercase tracking-wider">{t('crop.exp')}</span>
                         <span className="text-purple-300 font-bold text-xs flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 text-purple-500/50" />
                            +{crop.exp}
                         </span>
                      </div>
                  </div>

                  {/* Multi-Harvest Info (if applicable) */}
                  <div className="p-2 bg-[#292524] flex items-center justify-between text-[10px]">
                     <div className="flex items-center gap-1.5 text-stone-400" title={t('crop.maxHarvests')}>
                        <RefreshCw className="w-3 h-3" />
                        <span>{crop.maxHarvests} {t('crop.seasons')}</span>
                     </div>

                     {crop.regrowTime > 0 ? (
                        <div className="flex items-center gap-1 text-emerald-500">
                           <Sprout className="w-3 h-3" />
                           <span>{t('crop.regrow')}: {crop.regrowTime}s</span>
                        </div>
                     ) : (
                        <span className="text-stone-600">{t('crop.oneTime')}</span>
                     )}
                  </div>
               </div>
             )})}
           </div>
        </div>
        
        {/* Footer */}
        <div className="p-3 bg-[#292524] border-t-2 border-[#44403c] flex justify-between items-center text-[10px] text-stone-500">
           <div className="flex gap-4">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full"></span> {t('footer.online')}</span>
              <span>{t('footer.refresh')}: AUTO</span>
           </div>
           <span className="font-mono opacity-50">{t('footer.prices')}</span>
        </div>
      </div>
    </div>
  );
}