import { 
    X, 
    Activity 
  } from "lucide-react";
  import { ActivityList } from "./ActivityList";
  
  interface LogSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    logs: any[];
  }
  
  export function LogSidebar({ isOpen, onClose, logs }: LogSidebarProps) {
    if (!isOpen) return null;
  
    return (
      <div className="fixed inset-0 z-50 lg:hidden flex justify-end font-mono">
        <div 
          className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" 
          onClick={onClose} 
        />
        <div className="relative w-80 bg-stone-900 h-full border-l-4 border-stone-600 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          <div className="flex-none p-4 border-b-2 border-stone-600 flex items-center justify-between bg-stone-800">
            <h2 className="font-bold text-sm flex items-center gap-2 text-white">
              <Activity className="w-4 h-4 text-green-400" />
              SYSTEM LOG
            </h2>
            <button onClick={onClose} className="text-white hover:text-red-400">
              <X className="w-6 h-6" />
            </button>
          </div>
          {/* [修改] bg-stone-950 -> bg-stone-900 */}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-stone-900">
             <ActivityList logs={logs} />
          </div>
        </div>
      </div>
    );
  }