// src/components/PatrolDog.tsx

"use client";

import React, { useEffect, useState, useRef } from "react";
import styles from "./PatrolDog.module.css";

interface PatrolDogProps {
  isActive: boolean;
  isDebug: boolean;
}

// [修改] 网格配置变更
// 土地是 3列 x 6行
// 巡逻线(缝隙+边缘)是 4竖 x 7横
const GRID_COLS = 4; // 0..3 (对应位置 0%, 33.3%, 66.6%, 100%)
const GRID_ROWS = 7; // 0..6 (对应位置 0/6 ... 6/6)

export function PatrolDog({ isActive, isDebug }: PatrolDogProps) {
  // 1. 状态管理
  // 初始位置设为 (0,0) 即左上角顶点
  const [pos, setPos] = useState({ col: 0, row: 0 });
  const [rotation, setRotation] = useState(0);

  const posRef = useRef(pos);
  const isMounted = useRef(false);

  // 2. 随机游走逻辑
  useEffect(() => {
    isMounted.current = true;
    posRef.current = pos;

    if (!isActive && !isDebug) return;

    const moveInterval = setInterval(() => {
      const current = posRef.current;
      
      // 获取所有合法的邻居 (上下左右的交叉点)
      const neighbors = [
        { col: current.col + 1, row: current.row, dir: 0 },   // 右
        { col: current.col, row: current.row + 1, dir: 90 },  // 下
        { col: current.col - 1, row: current.row, dir: 180 }, // 左
        { col: current.col, row: current.row - 1, dir: 270 }, // 上
      ].filter(n => 
        n.col >= 0 && n.col < GRID_COLS && 
        n.row >= 0 && n.row < GRID_ROWS
      );

      // 随机选一个方向移动
      if (neighbors.length > 0) {
        // [优化] 简单的防止掉头算法：如果可选路径大于1，尽量不直接掉头 (增加随机性体验)
        // 这里为了简单保持纯随机，也可以加入权重
        const next = neighbors[Math.floor(Math.random() * neighbors.length)];
        
        setPos({ col: next.col, row: next.row });
        setRotation(next.dir);
        posRef.current = { col: next.col, row: next.row };
      }

    }, 2000); // 2秒走一段线

    return () => {
      clearInterval(moveInterval);
      isMounted.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isDebug]);

  if (!isActive && !isDebug) return null;

  // 3. [修改] 计算 CSS 位置 (百分比定位)
  // 不再加 0.5，而是直接按比例分布在网格线上
  // 例如 3列土地有 2个中间缝隙和2个边缘，共3个间隔，4个点：0/3, 1/3, 2/3, 3/3
  const leftPercent = (pos.col / (GRID_COLS - 1)) * 100;
  const topPercent = (pos.row / (GRID_ROWS - 1)) * 100;

  return (
    <>
      {/* 调试模式显示的网格边界 */}
      {isDebug && (
        <div className="absolute inset-0 border-2 border-dashed border-red-500/30 bg-red-500/5 z-0 pointer-events-none">
          <div className="absolute top-0 left-0 bg-red-900 text-white text-[9px] px-1 font-mono">
             PATH MESH: {GRID_COLS}x{GRID_ROWS}
          </div>
        </div>
      )}

      {/* 狗容器 */}
      <div
        className={styles.dogContainer}
        style={{
          left: `${leftPercent}%`,
          top: `${topPercent}%`,
          // [新增] 稍微增加层级，让它看起来像是在田埂上跑，盖住一点点土地边缘
          zIndex: 30 
        }}
      >
        {/* 旋转层 */}
        <div 
            className={styles.dogBody}
            style={{ transform: `rotate(${rotation}deg)` }}
        >
            <div className={`w-full h-full transition-colors duration-300 ${
              isActive ? "text-cyan-400" : "text-stone-500"
            }`}>
                <svg
                viewBox="0 0 100 100"
                className="w-full h-full drop-shadow-[2px_2px_0_rgba(0,0,0,0.5)]"
                >
                <path fill="currentColor" d="M20,20 h60 v60 h-60 z" />
                <rect x="60" y="30" width="10" height="10" fill="black" />
                <rect x="70" y="50" width="20" height="10" fill="currentColor" />
                <rect x="20" y="10" width="20" height="10" fill="currentColor" />
                
                <circle
                    cx="35"
                    cy="50"
                    r="5"
                    fill={isActive ? "#fff" : "#555"}
                    className={isActive ? "animate-ping" : ""}
                />
                </svg>
            </div>
        </div>

        {/* 调试坐标 */}
        {isDebug && (
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-black/80 text-green-400 text-[8px] px-1 whitespace-nowrap font-mono border border-green-900">
             [{pos.col},{pos.row}]
            </div>
        )}
      </div>
    </>
  );
}