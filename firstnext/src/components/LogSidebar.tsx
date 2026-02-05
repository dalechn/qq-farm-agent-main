import { useRef } from "react";
import { VirtuosoHandle } from "react-virtuoso"; 
import { 
    X, 
    Activity,
    Globe,
    User,
    Loader2,
    RotateCw 
  } from "lucide-react";
import { ActivityList } from "./ActivityList";
import { type ActionLog } from "@/lib/api";
  
interface LogSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  logs: ActionLog[];
  onPlayerClick?: (name: string) => void;
  activeTab: 'global' | 'agent';
  onTabChange: (tab: 'global' | 'agent') => void;
  isLoading?: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}
  
export function LogSidebar({ 
  isOpen, 
  onClose, 
  logs, 
  onPlayerClick,
  activeTab,
  onTabChange,
  isLoading,
  hasMore,
  onLoadMore,
  isLoadingMore,
  onRefresh,
  isRefreshing
}: LogSidebarProps) {
  
  // 移动端列表 Ref
  const mobileListRef = useRef<VirtuosoHandle>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex justify-end font-mono">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose} 
      />
      
      <div className="relative w-80 bg-stone-900 h-full border-l-4 border-stone-600 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        
        <div className="flex-none h-14 border-b-2 border-stone-600 flex items-center justify-between px-3 bg-stone-800 gap-2">
           <div className="flex items-center gap-2 flex-1">
             <Activity className="w-4 h-4 text-green-400" />
             <span className="font-bold text-xs text-white uppercase tracking-wider">SYSTEM LOG</span>
             
             {/* 移动端刷新按钮 */}
             <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                  // [修改] 瞬间跳回顶部 (behavior: 'auto')
                  mobileListRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'auto' });
                }}
                disabled={isRefreshing}
                className="p-1.5 ml-1 hover:bg-stone-700 rounded-full transition-colors text-stone-400 hover:text-white active:bg-stone-600 focus:outline-none"
             >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-orange-400' : ''}`} />
             </button>
           </div>
           
           <div className="flex bg-stone-950 p-0.5 rounded-sm flex-none">
             <button 
               onClick={() => onTabChange('global')}
               className={`px-2 py-1 text-[10px] font-bold font-mono transition-colors flex items-center gap-1 ${activeTab === 'global' ? 'bg-stone-700 text-white shadow-sm' : 'text-stone-500 hover:text-stone-300'}`}
             >
               <Globe className="w-3 h-3" /> ALL
             </button>
             <button 
               onClick={() => onTabChange('agent')}
               className={`px-2 py-1 text-[10px] font-bold font-mono transition-colors flex items-center gap-1 ${activeTab === 'agent' ? 'bg-orange-900/50 text-orange-200 border border-orange-500/30' : 'text-stone-500 hover:text-stone-300'}`}
             >
               <User className="w-3 h-3" /> AGENT
             </button>
           </div>

           <button onClick={onClose} className="text-white hover:text-red-400 ml-1">
             <X className="w-5 h-5" />
           </button>
        </div>

        <div className="flex-1 min-h-0 bg-stone-900 relative">
            {isLoading && logs.length === 0 ? (
              <div className="absolute inset-0 bg-stone-900/80 flex items-center justify-center z-10">
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
              </div>
            ) : null}

            {activeTab === 'agent' && logs.length === 0 && !isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-stone-600 text-xs font-mono p-4 text-center">
                <User className="w-8 h-8 mb-2 opacity-20" />
                <p>NO AGENT SELECTED</p>
              </div>
            ) : (
              <ActivityList 
                ref={mobileListRef} 
                logs={logs} 
                onPlayerClick={(name) => {
                  onClose(); 
                  if (onPlayerClick) onPlayerClick(name);
                }}
                hasMore={hasMore}
                onLoadMore={onLoadMore}
                isLoadingMore={isLoadingMore}
              />
            )}
        </div>
      </div>
    </div>
  );
}