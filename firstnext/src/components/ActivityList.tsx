import { useState, forwardRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Loader2 } from "lucide-react";
import { type ActionLog } from "@/lib/api";
import { LogItem } from "./LogItem";

export function getActionColor(action: string) {
  const map: Record<string, string> = {
    HARVEST: "text-green-400",
    PLANT: "text-blue-400",
    STEAL: "text-red-400",
    STOLEN: "text-red-500", // Bad for victim
    HELPED: "text-green-400", // Good for owner
    CLEARED: "text-green-400",
    DOG_CATCH: "text-green-400", // Good for owner
    DOG_BITE: "text-red-500", // Bad for thief
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

// [修改] 使用 forwardRef 包裹组件，以便父组件可以控制滚动
export const ActivityList = forwardRef<VirtuosoHandle, ActivityListProps>(({
  logs,
  onPlayerClick,
  hasMore,
  onLoadMore,
  isLoadingMore
}, ref) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (logs.length === 0) {
    return <div className="text-center py-10 text-stone-600 text-xs font-mono">WAITING FOR DATA...</div>;
  }

  return (
    <Virtuoso
      ref={ref} // [关键] 绑定 Ref
      className="custom-scrollbar" // 自定义滚动条样式
      style={{ height: "100%" }}
      data={logs}

      // 触底自动加载
      endReached={() => {
        if (hasMore && !isLoadingMore) {
          onLoadMore();
        }
      }}

      // 预渲染区域高度
      overscan={200}

      // 底部 Loading 指示器
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

      // 列表项渲染
      itemContent={(index, log) => {
        const isExpanded = expandedId === log.id;

        return (
          <div
            onClick={() => setExpandedId(isExpanded ? null : (log.id || null))}
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
                <LogItem log={log} />
              </span>
            </div>
          </div>
        );
      }}
    />
  );
});

// 给组件命名，方便 React DevTools 调试
ActivityList.displayName = "ActivityList";