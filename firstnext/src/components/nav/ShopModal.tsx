import { 
  X, 
  ShoppingBasket, 
  Clock, 
  TrendingUp,
  Layers // 用于表示产量 (Stack/Yield)
} from "lucide-react";
import { type Crop } from "@/lib/api";

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  crops: Crop[];
}

export function ShopModal({ isOpen, onClose, crops }: ShopModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-mono p-4">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose} 
      />
      
      {/* 模态框主体 */}
      <div 
        className="relative w-full max-w-2xl bg-stone-800 border-2 border-stone-500 shadow-[8px_8px_0_0_#0c0a09] flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex-none h-12 border-b-2 border-stone-600 bg-stone-700 flex items-center justify-between px-4 select-none">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-yellow-600 border border-yellow-400 flex items-center justify-center shadow-sm">
               <ShoppingBasket className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-stone-200 uppercase tracking-widest leading-none">SUPPLY DEPOT</h2>
              <span className="text-[10px] text-stone-400">Global Market Access</span>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center bg-stone-800 border border-stone-500 text-stone-400 hover:text-white hover:bg-red-900/50 hover:border-red-500 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content - Grid Layout */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#1c1917]">
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             {crops.map((crop) => {
               // [修复公式] 利润 = (单价 * 产量) - 成本
               // 注意：如果后端 yield 默认为 1，则不受影响；如果是多产量作物，这里就会变正数
               const yieldAmount = crop.yield || 1; // 防止 yield 字段不存在时报错
               const totalRevenue = crop.sellPrice * yieldAmount;
               const profit = totalRevenue - crop.seedPrice;
               const isProfitable = profit >= 0;

               return (
               <div key={crop.type} className="group bg-stone-800 border-2 border-stone-600 p-3 hover:border-orange-500 hover:-translate-y-1 transition-all duration-200 shadow-sm hover:shadow-[4px_4px_0_0_rgba(249,115,22,0.2)]">
                  
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-3">
                     <div className="flex items-center gap-3">
                        {/* Icon Box */}
                        <div className="w-12 h-12 bg-stone-900 border-2 border-stone-700 flex items-center justify-center text-2xl group-hover:border-orange-500/50 transition-colors select-none">
                            {crop.type === 'radish' ? '🥬' : 
                             crop.type === 'carrot' ? '🥕' :
                             crop.type === 'corn' ? '🌽' : 
                             crop.type === 'strawberry' ? '🍓' : '🍉'}
                        </div>
                        <div>
                           <div className="font-bold text-sm text-stone-200 uppercase tracking-wide">{crop.name}</div>
                           <div className="text-[10px] text-stone-500">Seed ID: {crop.type.substring(0,3).toUpperCase()}</div>
                        </div>
                     </div>
                     <span className="bg-stone-900 text-stone-400 text-[9px] px-1.5 py-0.5 border border-stone-700 font-bold">
                       LV.1
                     </span>
                  </div>
                  
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 bg-stone-900/50 p-2 border border-stone-700/50 mb-3">
                      <div className="flex flex-col">
                         <span className="text-[9px] text-stone-500 uppercase">Cost</span>
                         <span className="text-yellow-500 font-bold text-xs">{crop.seedPrice} G</span>
                      </div>
                      <div className="flex flex-col text-right">
                         <span className="text-[9px] text-stone-500 uppercase">Net Profit</span>
                         <span className={`font-bold text-xs ${isProfitable ? 'text-green-500' : 'text-red-500'}`}>
                           {isProfitable ? '+' : ''}{profit} G
                         </span>
                      </div>
                  </div>

                  {/* Footer Info: Time | Yield | EXP */}
                  <div className="flex items-center justify-between pt-2 border-t border-stone-700 text-[10px]">
                     <div className="flex items-center gap-1.5 text-stone-400 group-hover:text-stone-300" title="Mature Time">
                        <Clock className="w-3 h-3" />
                        <span>{crop.matureTime}s</span>
                     </div>
                     
                     {/* [新增] 显示产量 Yield */}
                     <div className="flex items-center gap-1.5 text-blue-400 group-hover:text-blue-300" title="Harvest Yield">
                        <Layers className="w-3 h-3" />
                        <span className="font-bold">x{yieldAmount}</span>
                     </div>

                     <div className="flex items-center gap-1.5 text-stone-400 group-hover:text-stone-300" title="Experience">
                        <TrendingUp className="w-3 h-3" />
                        <span>+{crop.exp} XP</span>
                     </div>
                  </div>
               </div>
             )})}
           </div>
        </div>
        
        {/* Footer */}
        <div className="p-3 bg-stone-800 border-t-2 border-stone-600 flex justify-between items-center text-[10px] text-stone-500">
           <span>MARKET STATUS: ONLINE</span>
           <span className="font-mono">PRICES INCLUDE YIELD EST.</span>
        </div>
      </div>
    </div>
  );
}