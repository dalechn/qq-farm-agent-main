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
  
  export function ActivityList({ logs }: { logs: any[] }) {
    if (logs.length === 0) {
      return <div className="text-center py-10 text-stone-600 text-xs font-mono">WAITING FOR DATA...</div>;
    }
    return (
      <div className="space-y-0.5 font-mono"> {/* space-y-0.5 增加微小间距 */}
        {logs.map((log) => (
          <div 
            key={log.id} 
            // [修改] 样式调整：
            // 1. bg-stone-900/40: 稍微亮一点的背景
            // 2. border-b border-stone-800: 增加分割线
            // 3. hover:bg-stone-800: 悬停高亮
            className="p-3 text-xs bg-stone-900/40 border-b border-stone-800/50 hover:bg-stone-800 transition-colors flex flex-col gap-1 cursor-default group"
          >
            <div className="flex justify-between items-center opacity-60 text-[10px]">
              <span className="group-hover:text-stone-300 transition-colors">{log.time}</span>
              <span className={`font-bold ${getActionColor(log.action)} bg-stone-950/50 px-1 rounded`}>{log.action}</span>
            </div>
            <div className="text-stone-400 truncate">
              <span className="text-orange-500 font-bold mr-2">{log.player}</span>
              <span className="text-stone-500 group-hover:text-stone-300 transition-colors">{log.details}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }