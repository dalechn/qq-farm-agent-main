import { useState } from "react";
import { 
  Activity, 
} from "lucide-react";
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

export function ActivityList({ logs, onPlayerClick }: { logs: any[], onPlayerClick?: (name: string) => void }) {
  // [新增] 状态：当前展开的日志 ID
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (logs.length === 0) {
    return <div className="text-center py-10 text-stone-600 text-xs font-mono">WAITING FOR DATA...</div>;
  }

  return (
    <div className="space-y-0.5 font-mono">
      {logs.map((log) => {
        const isExpanded = expandedId === log.id;
        
        return (
          <div 
            key={log.id} 
            // [修改] 点击行切换展开状态
            // 样式调整：展开时背景稍微变亮，并允许换行
            onClick={() => setExpandedId(isExpanded ? null : log.id)}
            className={`
              p-3 text-xs border-b border-stone-800/50 transition-all duration-200 flex flex-col gap-1 cursor-pointer group
              ${isExpanded ? 'bg-stone-800 border-l-2 border-l-orange-500 pl-[10px]' : 'bg-stone-900/40 hover:bg-stone-800 border-l-2 border-l-transparent'}
            `}
          >
            <div className="flex justify-between items-center opacity-60 text-[10px]">
              <span className="group-hover:text-stone-300 transition-colors">{log.time}</span>
              <span className={`font-bold ${getActionColor(log.action)} bg-stone-950/50 px-1 rounded`}>{log.action}</span>
            </div>
            
            {/* [修改] 文本区域：根据状态决定是否 truncate */}
            <div className={`text-stone-400 ${isExpanded ? 'whitespace-normal break-words' : 'truncate'}`}>
              <span 
                className="text-orange-500 font-bold mr-2 hover:underline hover:text-orange-400 relative z-10"
                onClick={(e) => {
                  // [关键] 阻止冒泡，防止触发行的展开点击
                  e.stopPropagation();
                  if (onPlayerClick) onPlayerClick(log.player);
                }}
              >
                {log.player}
              </span>
              <span className="text-stone-500 group-hover:text-stone-300 transition-colors">
                {log.details}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}