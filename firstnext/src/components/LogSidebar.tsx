import { 
    X, 
    Activity,
    Globe,
    User,
    Loader2
  } from "lucide-react";
  import { ActivityList } from "./ActivityList";
  
  interface LogSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    logs: any[];
    onPlayerClick?: (name: string) => void;
    // [新增] Tab 相关属性
    activeTab: 'global' | 'agent';
    onTabChange: (tab: 'global' | 'agent') => void;
    isLoading?: boolean;
  }
  
  export function LogSidebar({ 
    isOpen, 
    onClose, 
    logs, 
    onPlayerClick,
    activeTab,
    onTabChange,
    isLoading
  }: LogSidebarProps) {
    if (!isOpen) return null;
  
    return (
      <div className="fixed inset-0 z-50 lg:hidden flex justify-end font-mono">
        {/* 背景遮罩 */}
        <div 
          className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" 
          onClick={onClose} 
        />
        
        <div className="relative w-80 bg-stone-900 h-full border-l-4 border-stone-600 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="flex-none h-14 border-b-2 border-stone-600 flex items-center justify-between px-3 bg-stone-800 gap-2">
            <div className="flex items-center gap-2 flex-1">
              <Activity className="w-4 h-4 text-green-400" />
              <span className="font-bold text-xs text-white uppercase tracking-wider">SYSTEM LOG</span>
            </div>
  
            {/* Tab Switcher */}
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
  
          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-stone-900 relative">
             {isLoading ? (
               <div className="absolute inset-0 bg-stone-900/80 flex items-center justify-center z-10">
                  <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
               </div>
             ) : null}
  
             {activeTab === 'agent' && logs.length === 0 && !isLoading ? (
               <div className="flex flex-col items-center justify-center h-full text-stone-600 text-xs font-mono p-4 text-center">
                  <User className="w-8 h-8 mb-2 opacity-20" />
                  <p>NO AGENT SELECTED</p>
                  <p className="text-[8px] mt-1 opacity-50">CLICK AN AGENT TO VIEW LOGS</p>
               </div>
             ) : (
               <ActivityList 
                 logs={logs} 
                 onPlayerClick={(name) => {
                   onClose(); 
                   if (onPlayerClick) onPlayerClick(name);
                 }} 
               />
             )}
          </div>
        </div>
      </div>
    );
  }