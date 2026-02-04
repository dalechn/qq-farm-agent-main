import { useEffect, useState } from "react";
import { 
  Timer, 
  CheckCircle2, 
  Skull 
} from "lucide-react";

const CROPS: Record<string, { name: string; emoji: string; color: string }> = {
  radish: { name: "白萝卜", emoji: "🥬", color: "text-green-400" },
  carrot: { name: "胡萝卜", emoji: "🥕", color: "text-orange-400" },
  corn: { name: "玉米", emoji: "🌽", color: "text-yellow-400" },
  strawberry: { name: "草莓", emoji: "🍓", color: "text-pink-400" },
  watermelon: { name: "西瓜", emoji: "🍉", color: "text-red-400" },
};

export function LandTile({ land }: { land: any }) {
  const crop = land.cropType ? CROPS[land.cropType] : null;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (land.status === 'planted' && land.matureAt) {
      const updateProgress = () => {
        const now = Date.now();
        const matureTime = new Date(land.matureAt!).getTime();
        const totalDuration = 60000;
        const elapsed = Math.max(0, totalDuration - (matureTime - now));
        const pct = Math.min(100, (elapsed / totalDuration) * 100);
        setProgress(pct);
      };
      updateProgress();
      const interval = setInterval(updateProgress, 1000);
      return () => clearInterval(interval);
    } else {
      setProgress(0);
    }
  }, [land.status, land.matureAt]);
  
  const getStatusStyle = () => {
    if (land.status === 'harvestable') return 'border-green-500/50 bg-green-950/20 shadow-[0_0_10px_rgba(34,197,94,0.15)]';
    if (land.status === 'planted') return 'border-cyan-500/30 bg-cyan-950/20';
    return 'border-slate-800 border-dashed bg-slate-900/20';
  };

  return (
    <div className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center p-2 relative transition-all ${getStatusStyle()}`}>
      
      {land.stolenCount > 0 && (
        <div className="absolute top-1 right-1 text-[10px] text-red-400 flex items-center bg-black/40 px-1 rounded z-10">
           <Skull className="w-2.5 h-2.5 mr-0.5" /> {land.stolenCount}
        </div>
      )}
      
      {land.status === 'empty' ? (
        <span className="text-slate-600 text-[10px] font-bold tracking-widest uppercase">
          EMPTY
        </span>
      ) : (
        <>
          <div className="text-3xl mb-1 drop-shadow-md">{crop?.emoji}</div>
          <div className={`text-[10px] font-bold ${crop?.color}`}>{crop?.name}</div>
          
          {land.status === 'planted' && (
            <div className="w-full mt-2">
               <div className="flex justify-center items-center gap-1 text-[10px] text-cyan-400 font-bold mb-1 uppercase">
                 <Timer className="w-3 h-3" /> Growing
               </div>
               <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                 <div className="h-full bg-cyan-500 transition-all duration-1000" style={{ width: `${progress}%` }} />
               </div>
            </div>
          )}

          {land.status === 'harvestable' && (
            <div className="mt-1">
              <span className="inline-block bg-green-500 text-green-950 text-[10px] font-extrabold px-2 py-0.5 rounded shadow-lg animate-pulse uppercase">
                READY
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

