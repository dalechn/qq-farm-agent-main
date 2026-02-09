import { useState } from "react";
import {
  X,
  ShoppingBasket,
  Clock,
  TrendingUp,
  Layers,
  RefreshCw,
  Coins,
  Sprout,
  Dog,
  Zap,
  Hammer
} from "lucide-react";
import { type Crop, type ShopData, publicApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from '@/components/ui/Toast';
import { IconSeed, CROP_ICONS } from "@/components/ui/CropIcons";



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
  shopData: ShopData | null;
}

type TabType = 'seeds' | 'items';

export function ShopModal({ isOpen, onClose, shopData }: ShopModalProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('seeds');
  const [buyingDogId, setBuyingDogId] = useState<string | null>(null);

  const handleBuyDog = async (dogId: string) => {
    if (buyingDogId) return;
    setBuyingDogId(dogId);
    try {
      const res = await publicApi.buyDog(dogId);
      if (res.success) {
        toast(t('toast.dogBought'), 'success');
        onClose();
      } else {
        toast(res.message || t('toast.actionFailed'), 'error');
      }
    } catch (e: any) {
      toast(e.message || t('toast.actionFailed'), 'error');
    } finally {
      setBuyingDogId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-mono p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* 模态框主体 */}
      {/* 修改: max-h-[85vh] -> h-[85vh] 以固定高度，避免切换 Tab 时跳动 */}
      <div
        className="relative w-full max-w-4xl bg-[#1c1917] border-2 border-[#44403c] flex flex-col h-[85vh] animate-in zoom-in-95 duration-200 shadow-2xl"
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

        {/* Tabs Navigation */}
        <div className="flex-none px-6 pt-4 bg-[#292524] border-b-2 border-[#44403c] flex gap-2 select-none">
          <button
            onClick={() => setActiveTab('seeds')}
            className={`
              px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all rounded-t-sm border-t-2 border-x-2
              flex items-center gap-2
              ${activeTab === 'seeds'
                ? 'bg-[#1c1917] border-[#44403c] border-b-[#1c1917] text-orange-400 -mb-[2px] z-10'
                : 'bg-[#292524] border-transparent text-stone-500 hover:text-stone-300 hover:bg-[#322c2b]'}
            `}
          >
            <Sprout className="w-4 h-4" />
            {t('shop.tab.seeds')}
          </button>

          <button
            onClick={() => setActiveTab('items')}
            className={`
              px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all rounded-t-sm border-t-2 border-x-2
              flex items-center gap-2
              ${activeTab === 'items'
                ? 'bg-[#1c1917] border-[#44403c] border-b-[#1c1917] text-orange-400 -mb-[2px] z-10'
                : 'bg-[#292524] border-transparent text-stone-500 hover:text-stone-300 hover:bg-[#322c2b]'}
            `}
          >
            <Hammer className="w-4 h-4" />
            {t('shop.tab.items')}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#1c1917]">
          {!shopData ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-500">
              <RefreshCw className="w-8 h-8 animate-spin mb-4 text-orange-500" />
              <span>{t('shop.loading')}</span>
            </div>
          ) : (
            <>
              {/* Seeds Tab Content */}
              {activeTab === 'seeds' && (
                <div className="animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {shopData.crops.map((crop: Crop) => {
                      const CropIcon = CROP_ICONS[crop.type] || IconSeed;
                      const landTypeColor = LAND_TYPE_COLORS[crop.requiredLandType || 'normal'] || LAND_TYPE_COLORS['normal'];

                      return (
                        <div key={crop.type} className="group relative bg-[#292524] border-2 border-[#44403c] hover:border-orange-500/50 hover:bg-[#322c2b] transition-all duration-200 shadow-sm flex flex-col">
                          {/* Card Header & Icon */}
                          <div className="flex p-3 gap-3">
                            <div className="w-16 h-16 bg-[#1c1917] border-2 border-[#44403c] flex items-center justify-center p-1 group-hover:border-orange-500/30 transition-colors">
                              <div className="w-full h-full">
                                <CropIcon />
                              </div>
                            </div>
                            <div className="flex-1 flex flex-col justify-between">
                              <div>
                                <h3 className="font-bold text-sm text-stone-100 uppercase tracking-wide leading-tight">{t(`crops.${crop.type}`)}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${landTypeColor}`}>
                                    {t(`land.${crop.requiredLandType || 'normal'}`)}
                                  </div>
                                  <div className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border bg-stone-800 text-purple-300 border-stone-600 flex items-center gap-1">
                                    <span>LV.{crop.requiredLevel || 1}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Pricing */}
                          <div className="grid grid-cols-2 gap-px bg-[#1c1917] border-y border-[#44403c]">
                            <div className="bg-[#262626] p-2 flex flex-col gap-1">
                              <span className="text-[9px] text-stone-500 uppercase tracking-wider">{t('shop.seedPrice')}</span>
                              <span className="text-orange-300 font-bold text-xs flex items-center gap-1">
                                <Coins className="w-3 h-3 text-orange-500/50" />
                                {crop.seedPrice}
                              </span>
                            </div>
                            <div className="bg-[#262626] p-2 flex flex-col gap-1">
                              <span className="text-[9px] text-stone-500 uppercase tracking-wider">{t('shop.sellPrice')}</span>
                              <span className="text-green-300 font-bold text-xs flex items-center gap-1">
                                <Coins className="w-3 h-3 text-green-500/50" />
                                {crop.sellPrice}
                              </span>
                            </div>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 gap-px bg-[#1c1917]">
                            {/* Yield commented out */}
                            <div className="bg-[#262626] p-2 flex flex-col gap-1">
                              <span className="text-[9px] text-stone-500 uppercase tracking-wider">{t('shop.yield')}</span>
                              <span className="text-yellow-300 font-bold text-xs flex items-center gap-1">
                                <Layers className="w-3 h-3 text-yellow-500/50" />
                                {crop.yield || 1}
                              </span>
                            </div>
                            <div className="bg-[#262626] p-2 flex flex-col gap-1">
                              <span className="text-[9px] text-stone-500 uppercase tracking-wider">{t('shop.time')}</span>
                              <span className="text-blue-300 font-bold text-xs flex items-center gap-1">
                                <Clock className="w-3 h-3 text-stone-500" />
                                {crop.matureTime}s
                              </span>
                            </div>
                            <div className="bg-[#262626] p-2 flex flex-col gap-1">
                              <span className="text-[9px] text-stone-500 uppercase tracking-wider">{t('shop.exp')}</span>
                              <span className="text-purple-300 font-bold text-xs flex items-center gap-1">
                                <TrendingUp className="w-3 h-3 text-purple-500/50" />
                                +{crop.exp}
                              </span>
                            </div>

                          </div>

                          {/* Multi-Harvest Info */}
                          <div className="p-2 bg-[#292524] flex items-center justify-between text-[10px] border-t border-[#44403c]">
                            <div className="flex items-center gap-1.5 text-stone-400">
                              <RefreshCw className="w-3 h-3" />
                              <span>{crop.maxHarvests} {t('shop.harvests')}</span>
                            </div>
                            {crop.regrowTime > 0 ? (
                              <div className="flex items-center gap-1 text-emerald-500">
                                <Sprout className="w-3 h-3" />
                                <span>{t('shop.regrow')}: {crop.regrowTime}s</span>
                              </div>
                            ) : (
                              <span className="text-stone-600">{t('shop.oneTime')}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items Tab Content */}
              {activeTab === 'items' && (
                <div className="animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Dogs */}
                    {shopData.dogs.map((dog) => (
                      <div key={dog.id} className="bg-[#292524] border-2 border-[#44403c] hover:border-blue-500/50 hover:bg-[#322c2b] transition-all duration-200 shadow-sm flex flex-col">
                        <div className="flex p-3 gap-3">
                          <div className="w-16 h-16 bg-[#1c1917] border-2 border-blue-500/30 flex items-center justify-center">
                            <Dog className="w-10 h-10 text-blue-400" />
                          </div>
                          <div className="flex-1 flex flex-col justify-between">
                            <div>
                              <h3 className="font-bold text-sm text-stone-100 uppercase tracking-wide">{t(`shop.dog.${dog.id}`)}</h3>
                              <p className="text-[10px] text-stone-400 mt-1">{t('shop.dog.description')}</p>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-px bg-[#1c1917] border-y border-[#44403c]">
                          <div className="bg-[#262626] p-2 flex flex-col gap-1">
                            <span className="text-[9px] text-stone-500 uppercase">{t('shop.dog.buy')}</span>
                            <span className="text-blue-300 font-bold text-xs flex items-center gap-1">
                              <Coins className="w-3 h-3 text-blue-500/50" />
                              {dog.price}
                            </span>
                          </div>
                          <div className="bg-[#262626] p-2 flex flex-col gap-1">
                            <span className="text-[9px] text-stone-500 uppercase">{t('shop.dog.food')}</span>
                            <span className="text-green-300 font-bold text-xs flex items-center gap-1">
                              <Coins className="w-3 h-3 text-green-500/50" />
                              {dog.foodPrice}
                            </span>
                          </div>
                        </div>
                        <div className="p-2 bg-[#292524] text-[10px] text-stone-400 space-y-0.5">
                          <div>{t('shop.dog.catchRate')}: {dog.catchRate}%</div>
                          <div>{t('shop.dog.foodDuration')}: {Math.floor(dog.foodDuration / 3600)}h</div>
                          <div className="flex items-center gap-1">
                            {t('shop.dog.bitePenalty')}:
                            <Coins className="w-3 h-3 text-yellow-500" />
                            <span className="text-stone-300 font-bold">{dog.bitePenalty}</span>
                          </div>
                        </div>
                        <div className="p-2 border-t border-[#44403c]">
                          <button
                            onClick={() => handleBuyDog(dog.id)}
                            disabled={buyingDogId === dog.id}
                            className="w-full py-1 bg-blue-900/50 hover:bg-blue-800 text-blue-200 text-xs font-bold uppercase tracking-wider border border-blue-700/50 rounded-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {buyingDogId === dog.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Coins className="w-3 h-3" />
                            )}
                            {t('shop.dog.buy')}
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Fertilizers */}
                    {shopData.fertilizers.map((fertilizer) => (
                      <div key={fertilizer.type} className="bg-[#292524] border-2 border-[#44403c] hover:border-green-500/50 hover:bg-[#322c2b] transition-all duration-200 shadow-sm flex flex-col">
                        <div className="flex p-3 gap-3">
                          <div className="w-16 h-16 bg-[#1c1917] border-2 border-green-500/30 flex items-center justify-center">
                            <Zap className="w-10 h-10 text-green-400" />
                          </div>
                          <div className="flex-1 flex flex-col justify-between">
                            <div>
                              <h3 className="font-bold text-sm text-stone-100 uppercase tracking-wide">{fertilizer.name}</h3>
                              <p className="text-[10px] text-stone-400 mt-1">{t('shop.fertilizer.description')}</p>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-px bg-[#1c1917] border-y border-[#44403c]">
                          <div className="bg-[#262626] p-2 flex flex-col gap-1">
                            <span className="text-[9px] text-stone-500 uppercase">{t('shop.fertilizer.price')}</span>
                            <span className="text-green-300 font-bold text-xs flex items-center gap-1">
                              <Coins className="w-3 h-3 text-green-500/50" />
                              {fertilizer.price}
                            </span>
                          </div>
                          <div className="bg-[#262626] p-2 flex flex-col gap-1">
                            <span className="text-[9px] text-stone-500 uppercase">{t('shop.fertilizer.timeSaved')}</span>
                            <span className="text-blue-300 font-bold text-xs flex items-center gap-1">
                              <Clock className="w-3 h-3 text-blue-500/50" />
                              {Math.floor(fertilizer.reduceSeconds / 3600)}h
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#292524] border-t-2 border-[#44403c] flex justify-between items-center text-[10px] text-stone-500">
          {/* <div className="flex gap-4">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full"></span> {t('footer.online')}</span>
            <span>{t('footer.refresh')}</span>
          </div> */}
          <span className="font-mono opacity-50">{t('footer.prices')}</span>
        </div>
      </div>
    </div>
  );
}