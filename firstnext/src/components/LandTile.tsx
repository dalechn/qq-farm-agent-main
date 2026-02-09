import { useEffect, useState } from "react";
import { Hand, Skull, Droplets, Bug, Sprout, Shovel, Zap, Lock, RefreshCw } from "lucide-react";
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
  isOwner?: boolean;
  ownerId?: string;
}

export function LandTile({ land, locked, selectedCrop, onUpdate, isOwner = false, ownerId }: LandProps) {
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  // @ts-ignore
  const currentCropId = land?.cropId || land?.cropType;

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
          border border-dashed border-stone-800/50 
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

  const handleClick = async () => {
    if (loading) return;

    try {
      setLoading(true);

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
      else if (ownerId) {
        if (land.status === 'harvestable' || isMature) {
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
    if (loading) return;
    try {
      setLoading(true);
      await publicApi.shovelLand(land.position, isOwner ? undefined : ownerId, getAuthHeaders());
      onUpdate?.();
    } catch (error: any) {
      console.warn('Shovel failed:', error);
      toast(error.message || t('toast.shovelFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFertilize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOwner) return;
    if (loading) return;
    try {
      setLoading(true);
      await publicApi.useFertilizer(land.position, 'normal', getAuthHeaders());
      onUpdate?.();
    } catch (error) {
      console.warn('Fertilizer failed:', error);
      toast(t('toast.fertilizerFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderCropIcon = () => {
    if (land.status === 'withered') {
      const Icon = currentCropId ? CROP_COMPONENTS[currentCropId] : IconSprout;
      return (
        <div className="grayscale opacity-60">
          {Icon && <Icon />}
        </div>
      );
    }

    if (isMature) {
      const Icon = currentCropId ? CROP_COMPONENTS[currentCropId] : IconRadish;
      return Icon ? <Icon /> : null;
    }

    if (progress < 30) return <IconSprout />;
    if (progress < 80) return <IconGrowing />;

    const Icon = currentCropId ? CROP_COMPONENTS[currentCropId] : IconRadish;
    return Icon ? <Icon /> : null;
  };

  const getLandStyle = () => {
    if (land.status === 'withered') {
      return "bg-stone-600 border-stone-800 opacity-100";
    }

    if (isMature) {
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
          bgEmpty: "bg-[#663c3c]",
          bgPlanted: "bg-[#3f2222]",
          border: "border-[#7f4f4f]"
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
      if (selectedCrop && isOwner) {
        return `${baseClasses} opacity-100 ring-2 ring-green-500/50 cursor-pointer`;
      } else {
        return `${baseClasses} ${isOwner ? 'opacity-90 hover:opacity-100 hover:brightness-110 transition-all' : 'opacity-90'}`;
      }
    }
  };

  const cropName = currentCropId ? t(`crops.${currentCropId}`) : '';

  const renderActions = () => {
    const btnClass = "w-7 h-7 shrink-0 flex items-center justify-center border shadow-[2px_2px_0_0_rgba(0,0,0,0.25)] active:translate-y-0.5 active:shadow-none transition-all";

    return (
      <div className="absolute inset-0 flex items-center justify-center gap-1.5 z-30">
        {land.needsWater && (
          <button
            onClick={(e) => handleCare(e, 'water')}
            className={`${btnClass} bg-blue-600 border-blue-400 hover:bg-blue-500 text-white`}
            title={t('action.water')}
          >
            <Droplets className="w-4 h-4" />
          </button>
        )}
        {land.hasWeeds && (
          <button
            onClick={(e) => handleCare(e, 'weed')}
            className={`${btnClass} bg-green-600 border-green-400 hover:bg-green-500 text-white`}
            title={t('action.weed')}
          >
            <Sprout className="w-4 h-4" />
          </button>
        )}
        {land.hasPests && (
          <button
            onClick={(e) => handleCare(e, 'pest')}
            className={`${btnClass} bg-red-600 border-red-400 hover:bg-red-500 text-white`}
            title={t('action.pest')}
          >
            <Bug className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className={`
        aspect-square relative 
        border 
        transition-all duration-300
        group 
        ${(isOwner || (!isOwner && isMature)) ? 'cursor-pointer' : 'cursor-default'}
        flex flex-col items-center justify-center
        select-none
        ${getLandStyle()}
      `}
      onClick={handleClick}
    >
      <div className="absolute inset-0 border-t border-l border-white/5 pointer-events-none"></div>

      {/* --- 左上角信息区 (z-40) --- */}
      <div className="absolute top-1 left-1 z-40 flex flex-col gap-1 pointer-events-none max-w-[85%] items-start">

        {/* 1. 作物名称 */}
        {land.status !== 'empty' && (
          <div className="
            flex items-center
            bg-stone-900 border border-stone-600 
            px-1.5 py-0.5
            shadow-[2px_2px_0_0_rgba(0,0,0,0.25)] 
            group-hover:bg-stone-800 transition-colors
          ">
            <span className="text-[8px] font-bold font-mono text-stone-200 leading-none tracking-wide uppercase">
              {cropName}
            </span>
          </div>
        )}

        {/* 2. 剩余收成次数 (颜色改为紫色) */}
        {land.status !== 'empty' && land.status !== 'withered' && land.remainingHarvests > 1 && (
          <div className="
             flex items-center gap-1 
             bg-purple-900 border border-purple-500/50
             px-1.5 py-0.5 
             text-[8px] font-mono text-purple-100 leading-none
             shadow-[2px_2px_0_0_rgba(0,0,0,0.25)]
             opacity-0 group-hover:opacity-100 transition-opacity duration-200
           ">
            <RefreshCw className="w-2.5 h-2.5" />
            <span className="font-bold">x{land.remainingHarvests}</span>
          </div>
        )}

        {/* 3. 土地类型 (显示在下方) */}
        <div className={`
            flex items-center gap-1
            px-1.5 py-0.5
            text-[8px] font-bold font-mono leading-none
            shadow-[2px_2px_0_0_rgba(0,0,0,0.25)]
            opacity-0 group-hover:opacity-100 transition-opacity duration-200
            border
            ${land.landType === 'red' ? 'bg-red-950/80 border-red-500/50 text-red-200' :
            land.landType === 'black' ? 'bg-stone-950/80 border-stone-600 text-stone-300' :
              land.landType === 'gold' ? 'bg-yellow-950/80 border-yellow-500/50 text-yellow-200' :
                'bg-stone-800/80 border-stone-500/50 text-stone-300'
          }
          `}>
          <span>{t(`land.${land.landType}`)}</span>
        </div>
      </div>

      {/* --- 右上角状态区 (z-40, 添加 leading-none) --- */}
      <div className="absolute top-1 right-1 z-40 flex flex-col items-end gap-1 pointer-events-none">

        {/* 状态标签: 添加 leading-none 确保高度与左侧一致 */}
        <div className={`
          px-1.5 py-0.5 text-[8px] font-bold font-mono border shadow-[2px_2px_0_0_rgba(0,0,0,0.25)] leading-none whitespace-nowrap
          ${isMature
            ? 'bg-green-600 border-green-400 text-white animate-pulse'
            : land.status === 'withered'
              ? 'bg-stone-700 border-stone-500 text-stone-400'
              : land.status === 'empty'
                ? 'bg-stone-900 border-stone-700 text-stone-600'
                : 'bg-stone-800 border-stone-600 text-stone-300'
          }
        `}>
          {isMature
            ? t('status.ripe')
            : land.status === 'withered'
              ? t('status.dead')
              : land.status === 'empty'
                ? t('status.idle')
                : t('status.grow')
          }
        </div>

        {/* 被偷警告: 添加 leading-none */}
        {land.stolenCount > 0 && (
          <div className="
            flex items-center gap-0.5
            bg-red-700 border border-red-500
            px-1.5 py-0.5 
            text-[8px] font-bold font-mono text-white shadow-[2px_2px_0_0_rgba(0,0,0,0.25)] leading-none whitespace-nowrap
          ">
            <Skull className="w-2.5 h-2.5" />
            <span>-{land.stolenCount * 10}%</span>
          </div>
        )}
      </div>

      {/* --- 中间主体内容 (保持不变) --- */}
      <div className="relative w-full h-full flex flex-col items-center justify-center p-2">
        {land.status === 'empty' ? (
          <div className="text-[#57534e] transition-colors">
            {loading ? (
              <div className="w-4 h-4 border-2 border-t-transparent border-white/50 animate-spin"></div>
            ) : (
              isOwner && <div className="text-4xl font-thin leading-none group-hover:text-[#a8a29e]">+</div>
            )}
          </div>
        ) : (
          <>
            {(isOwner || (ownerId && land.status === 'withered')) && land.status === 'withered' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                <button onClick={handleShovel} className="bg-stone-700 hover:bg-red-600 text-white p-1.5 border border-stone-500 shadow-[2px_2px_0_0_rgba(0,0,0,0.25)] transition-colors pointer-events-auto active:translate-y-0.5">
                  <Shovel className="w-5 h-5" />
                </button>
              </div>
            )}


            <div className={`w-12 h-12 sm:w-14 sm:h-14 transition-transform duration-500 relative ${isMature ? 'animate-bounce-slow' : 'scale-90 group-hover:scale-100'}`}>
              {renderCropIcon()}
            </div>

            {/* 动作按钮: 移出缩放容器，避免 hover 时移动，并防止挤压 */}
            {!isMature && land.status === 'planted' && renderActions()}

            <div className="absolute bottom-1 w-full px-2 flex flex-col items-center z-10">
              {!isMature && land.status !== 'withered' && (
                <div className="w-full h-1.5 bg-black/50 border border-white/10 p-[1px] mb-0.5">
                  <div
                    className="h-full bg-green-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {isMature && (
                <div className={`text-black text-[8px] px-2 py-0.5 font-bold font-mono border border-black shadow-[2px_2px_0_0_rgba(0,0,0,0.25)] tracking-wide shrink-0 whitespace-nowrap ${!isOwner ? 'bg-red-500 text-white' : 'bg-yellow-500/90'}`}>
                  {!isOwner ? t('action.STEAL') : t('action.HARVEST')}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div >
  );
}