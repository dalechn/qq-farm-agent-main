import { useState } from "react";
import { Virtuoso } from "react-virtuoso"; 
import { Loader2 } from "lucide-react";
import { type ActionLog } from "@/lib/api";

export function getActionColor(action: string) {
  const map: Record<string, string> = {
    HARVEST: "text-green-400",
    PLANT: "text-blue-400",
    STEAL: "text-red-400",
    JOIN: "text-cyan-400",
  };
  return map[action] || "text-stone-400";
}

interface ActivityListProps {
  logs: ActionLog[];
  onPlayerClick?: (name: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
}

export function ActivityList({ 
  logs, 
  onPlayerClick, 
  hasMore, 
  onLoadMore, 
  isLoadingMore 
}: ActivityListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (logs.length === 0) {
    return <div className="text-center py-10 text-stone-600 text-xs font-mono">WAITING FOR DATA...</div>;
  }

  return (
    <Virtuoso
      // [修改点] 添加 custom-scrollbar 类名
      className="custom-scrollbar"
      style={{ height: "100%" }} 
      data={logs}
      endReached={() => {
        if (hasMore && !isLoadingMore) {
          onLoadMore();
        }
      }}
      overscan={200} 
      
      components={{
        Footer: () => (
          <div className="py-4 flex justify-center w-full min-h-[40px]">
            {isLoadingMore && (
              <div className="flex items-center gap-2 text-stone-500 text-[10px]">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>LOADING...</span>
              </div>
            )}
            {!hasMore && logs.length > 0 && (
              <span className="text-stone-700 text-[10px]">// END OF LOGS //</span>
            )}
          </div>
        )
      }}

      itemContent={(index, log) => {
        const isExpanded = expandedId === log.id;
        
        return (
          <div 
            onClick={() => setExpandedId(isExpanded ? null : log.id)}
            className={`
              p-3 text-xs border-b border-stone-800/50 transition-all duration-200 flex flex-col gap-1 cursor-pointer group
              ${isExpanded ? 'bg-stone-800 border-l-2 border-l-orange-500 pl-[10px]' : 'bg-stone-900/40 hover:bg-stone-800 border-l-2 border-l-transparent'}
            `}
          >
            <div className="flex justify-between items-center opacity-60 text-[10px]">
              <span className="group-hover:text-stone-300 transition-colors">
                {new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`font-bold ${getActionColor(log.action)} bg-stone-950/50 px-1 rounded`}>{log.action}</span>
            </div>
            
            <div className={`text-stone-400 ${isExpanded ? 'whitespace-normal break-words' : 'truncate'}`}>
              <span 
                className="text-orange-500 font-bold mr-2 hover:underline hover:text-orange-400 relative z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPlayerClick) onPlayerClick(log.playerName);
                }}
              >
                {log.playerName}
              </span>
              <span className="text-stone-500 group-hover:text-stone-300 transition-colors">
                {log.details}
              </span>
            </div>
          </div>
        );
      }}
    />
  );
}