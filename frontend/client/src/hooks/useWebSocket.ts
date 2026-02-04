/**
 * WebSocket Hook
 * 实时接收后端推送的消息
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

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
    if (!apiKey) return;

    const url = `${WS_BASE}?apiKey=${apiKey}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('🔌 WebSocket connected');
      setIsConnected(true);
      onConnect?.();
    };

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

      // 自动重连
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
  }, [apiKey, onMessage, onConnect, onDisconnect, reconnectInterval]);

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
