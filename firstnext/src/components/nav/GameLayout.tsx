"use client";

import { GameProvider, useGame } from "@/context/GameContext";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/ui/Toast";
import { GameHeader } from "@/components/nav/GameHeader";
import { ShopModal } from "@/components/nav/ShopModal";
import { LogSidebar } from "@/components/LogSidebar";
// 注意：如果 LogSidebar 依赖特定页面逻辑，可以留在 Dashboard，
// 但既然 GameHeader 在全局控制它，建议把 Activity/LogSidebar 也做成全局的。

function GameLayoutContent({ children }: { children: React.ReactNode }) {
  const {
    stats,
    searchQuery,
    setSearchQuery,
    handleSearch,
    isConnected,
    isShopOpen,
    setIsShopOpen,
    isActivityOpen,
    setIsActivityOpen,
    crops,
    logs, // 如果 LogSidebar 全局化需要用到
    isLoading, // 用于 LogSidebar 加载状态
    hasMoreLogs, // 下面这几个是分页用的
    loadMoreLogs,
    isFetchingMoreLogs,
  } = useGame();

  return (
    <div className="h-screen w-full bg-[#1c1917] text-stone-200 font-sans flex flex-col overflow-hidden selection:bg-orange-500/30">
      {/* 全局 Header */}
      <GameHeader
        stats={stats}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearch={handleSearch}
        isConnected={isConnected}
        onOpenShop={() => setIsShopOpen(true)}
        onOpenActivity={() => setIsActivityOpen(true)}
      />

      {/* 页面主体内容 */}
      <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col lg:flex-row bg-[#1c1917]">
        {children}
      </div>

      {/* 全局模态框 */}
      <ShopModal
        isOpen={isShopOpen}
        onClose={() => setIsShopOpen(false)}
        crops={crops}
      />

      {/* 移动端日志侧边栏 (可选：如果你希望它也是全局的) */}
      {/* <LogSidebar 
        isOpen={isActivityOpen} 
        onClose={() => setIsActivityOpen(false)} 
        logs={logs} // 这里需要根据 context 处理 logs 数据结构，或者直接传 raw logs
        activeTab="global" // 简化处理，全局侧边栏默认显示 global
        onTabChange={() => {}} 
        isLoading={isLoading}
        hasMore={hasMoreLogs}
        onLoadMore={loadMoreLogs}
        isLoadingMore={isFetchingMoreLogs}
      /> */}
    </div>
  );
}

export function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <GameProvider>
      <I18nProvider>
        <ToastProvider>
          <GameLayoutContent>{children}</GameLayoutContent>
        </ToastProvider>
      </I18nProvider>
    </GameProvider>
  );
}