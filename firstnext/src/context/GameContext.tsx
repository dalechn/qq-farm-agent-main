"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { useGameData } from "@/hooks/useGameData";
import { useRouter } from "next/navigation";

// 定义 Context 的类型，包含数据和 UI 状态
const GameContext = createContext<any>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  // 1. 在这里调用 useGameData，这是全局唯一的实例，WebSocket 将在这里连接
  const gameData = useGameData();
  
  // 2. 将原本在 FarmDashboard 里的 UI 状态提升到这里
  const [searchQuery, setSearchQuery] = useState("");
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false); // 控制手机端日志侧边栏
  
  const router = useRouter();

  // 3. 全局搜索处理逻辑
  // 统一逻辑：搜索直接跳转路由，不再区分 PC/Mobile 内部状态切换，利用 Next.js 缓存优势
  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      router.push(`/u/${encodeURIComponent(searchQuery.trim())}`);
    }
  }, [searchQuery, router]);

  const value = {
    ...gameData,
    searchQuery,
    setSearchQuery,
    handleSearch,
    isShopOpen,
    setIsShopOpen,
    isActivityOpen,
    setIsActivityOpen,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// 导出自定义 Hook 方便组件使用
export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
};