import { useEffect, useRef, useState, useCallback } from 'react';

// 注意：Next.js 在客户端组件中使用 WebSocket
// 环境变量在前端代码中依然需要 NEXT_PUBLIC_ 前缀
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

interface UseWebSocketOptions {
  apiKey?: string;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectInterval?: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    apiKey,
    onMessage,
    onConnect,
    onDisconnect,
    reconnectInterval = 3000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    // 修改：移除 if (!apiKey) return; 的限制
    // 如果有 apiKey 就拼上去，没有就作为游客连接
    const url = apiKey ? `${WS_BASE}?apiKey=${apiKey}` : WS_BASE;
    
    console.log('🔌 Connecting to WebSocket:', url); // Debug log

    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('🔌 WebSocket connected');
      setIsConnected(true);
      onConnect?.();
    };

    // ... 其余保持不变 ...
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        setLastMessage(message);
        onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('❌ WebSocket disconnected');
      setIsConnected(false);
      onDisconnect?.();

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        connect();
      }, reconnectInterval);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, [apiKey, onMessage, onConnect, onDisconnect, reconnectInterval]); // 依赖项保持不变

  // ... 保持 disconnect 和 send 不变 ...
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
  }, []);

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    send,
    reconnect: connect,
    disconnect,
  };
}

