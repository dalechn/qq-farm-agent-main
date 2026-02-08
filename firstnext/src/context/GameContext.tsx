"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { useGameData } from "@/hooks/useGameData";
import { useRouter } from "next/navigation";
import { publicApi } from "@/lib/api"; // [新增] 引入 api

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
  // [修改] 先尝试通过 Auth Server 搜索名字获取 ID，如果搜到了就跳转 ID，没搜到就直接当作 ID 跳转
  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;

    try {
      // 尝试按名字搜索
      const result = await publicApi.searchUserByName(query);

      // @ts-ignore (因为如果出错 api 会返回 { success: false, ... })
      if (result && result.id) {
        // 搜到了 -> 跳转到 ID
        router.push(`/u/${result.id}`);
      } else {
        // 搜不到 -> 认为输入的就是 ID (或者用户不存在)，直接跳转
        router.push(`/u/${encodeURIComponent(query)}`);
      }
    } catch (e) {
      // 网络错误等兜底 -> 直接跳转
      router.push(`/u/${encodeURIComponent(query)}`);
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