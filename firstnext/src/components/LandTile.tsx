// src/components/LandTile.tsx

import { useEffect, useState } from "react";
import { Hand, Skull, Droplets, Bug, Sprout, Shovel, Zap, Lock } from "lucide-react";
import { Land, publicApi, getAuthHeaders } from "../lib/api";
import { useToast } from "./ui/Toast";
import { useI18n } from "@/lib/i18n";
import {
  IconSprout,
  IconGrowing,
  IconRadish,
  CROP_ICONS
} from "./ui/CropIcons";

const CROP_COMPONENTS = CROP_ICONS;



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
  const { toast } = useToast();
  const { t } = useI18n();

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
          await publicApi.plant(land.position, selectedCrop, getAuthHeaders());
          onUpdate?.();
        } else if (land.status === 'harvestable' || isMature) {
          const res = await publicApi.harvest(land.position, getAuthHeaders());
          if (res.healthLoss && res.healthLoss > 0) {
            toast(t('toast.harvestedWithLoss', { crop: cropName, gold: res.gold, loss: res.healthLoss }), 'success');
          } else {
            toast(t('toast.harvested', { crop: cropName, gold: res.gold }), 'success');
          }
          onUpdate?.();
        } else if (land.status === 'withered') {
          await publicApi.shovelLand(land.position, undefined, getAuthHeaders());
          onUpdate?.();
        }
      }
      // --- 访客模式 (偷菜) ---
      else if (ownerId) {
        if (land.status === 'harvestable' || isMature) {
          // 偷菜
          const res = await publicApi.steal(ownerId, land.position, getAuthHeaders());
          if (res.success) {
            toast(t('toast.stolen', { amount: res.stolen.amount, crop: res.stolen.cropName }), 'steal');
            onUpdate?.();
          } else if (res.penalty) {
            toast(t('toast.bittenByDog', { penalty: res.penalty }), 'error');
            onUpdate?.();
          } else if (res.reason === 'Daily steal limit reached') {
            const current = (res as any).current || 0;
            const limit = (res as any).limit || 1000;
            toast(t('toast.dailyLimitReached', { current, limit }), 'error');
          } else if (res.reason === 'Already stolen by you') {
            toast(t('toast.alreadyStolen'), 'error');
          } else if (res.reason === 'Already fully stolen') {
            toast(t('toast.fullyStolen'), 'error');
          } else {
            toast(res.reason || t('toast.actionFailed'), 'error');
          }
        } else {
          // 访客点击其他状态不做操作 (防止误把自己的种子种别人地里)
          console.log("Visitor action restricted");
        }
      }

    } catch (error: any) {
      console.warn('Action failed:', error);
      toast(error.message || t('toast.actionFailed'), 'error');
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
      await publicApi.careLand(land.position, type, isOwner ? undefined : ownerId, getAuthHeaders());
      onUpdate?.();
    } catch (error: any) {
      console.warn('Care failed:', error);
      toast(error.message || t('toast.careFailed'), 'error');
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
      await publicApi.shovelLand(land.position, isOwner ? undefined : ownerId, getAuthHeaders());
      onUpdate?.(); // 铲除成功 -> 刷新
    } catch (error: any) {
      console.warn('Shovel failed:', error);
      toast(error.message || t('toast.shovelFailed'), 'error');
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
      await publicApi.useFertilizer(land.position, 'normal', getAuthHeaders());
      onUpdate?.(); // 施肥成功 -> 刷新
    } catch (error) {
      console.warn('Fertilizer failed:', error);
      toast(t('toast.fertilizerFailed'), 'error');
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

  const cropName = currentCropId ? t(`crops.${currentCropId}`) : '';

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
          <div className="bg-red-600 border border-black text-white px-1.5 py-0.5 text-[8px] font-bold font-mono shadow-sm">
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

            {/* {land.status === 'withered' && (
              <div className="absolute bottom-1 z-30 text-[8px] text-red-400 font-mono bg-black/60 px-2 py-0.5">
                {t('status.dead')}
              </div>
            )} */}

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
                  {!isOwner ? t('action.STEAL') : t('action.HARVEST')}
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

      {/* Status Label */}
      {land.status !== 'empty' && (
        <div className="absolute top-1 right-1 bg-black/40 px-1 py-0.5 rounded text-[8px] font-mono text-white/80 pointer-events-none z-20">
          {isMature ? t('status.ripe') : land.status === 'withered' ? t('status.dead') : t('status.grow')}
        </div>
      )}
    </div>
  );
}