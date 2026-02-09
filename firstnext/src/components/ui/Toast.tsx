"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, CheckSquare, AlertTriangle, Terminal, Skull } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'steal';

export interface Toast {
    id: string;
    message: string;
    type?: ToastType;
    duration?: number;
}

interface ToastContextType {
    toast: (message: string, type?: ToastType, duration?: number) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type, duration }]);

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ toast, removeToast }}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

// ----------------------------------------------------------------------
// Internal Components
// ----------------------------------------------------------------------

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
    return (
        // [修改] top-16 更靠上, gap-2 间距更小, max-w-[320px] 宽度更窄
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-[320px] px-4 pointer-events-none">
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(true), 10);
        return () => clearTimeout(timer);
    }, []);

    const handleDismiss = () => {
        setIsVisible(false);
        setTimeout(onDismiss, 200);
    };

    const getThemeStyles = () => {
        // [修改] 阴影缩小为 2px，边框改为 1px (默认 border 就是 1px)
        // 使用 border 而不是 border-2，显得更细致
        const base = "border shadow-[2px_2px_0_0_rgba(0,0,0,1)]";

        switch (toast.type) {
            case 'success':
                return `${base} bg-green-950 border-green-500 text-green-400`;
            case 'error':
                return `${base} bg-red-950 border-red-500 text-red-400`;
            case 'steal':
                return `${base} bg-yellow-950 border-yellow-500 text-yellow-400`;
            case 'info':
            default:
                return `${base} bg-[#1c1917] border-stone-600 text-stone-300`;
        }
    };

    const getIcon = () => {
        // [修改] 图标缩小到 w-3.5 h-3.5
        const iconClass = "w-3.5 h-3.5 flex-shrink-0";
        switch (toast.type) {
            case 'success': return <CheckSquare className={iconClass} />;
            case 'error': return <AlertTriangle className={iconClass} />;
            case 'steal': return <Skull className={`${iconClass} animate-pulse`} />;
            case 'info':
            default: return <Terminal className={iconClass} />;
        }
    };

    return (
        <div
            className={`
                pointer-events-auto
                /* [修改] p-2 更紧凑的内边距, gap-2 减小间距 */
                flex items-start gap-2 p-2 
                font-mono uppercase tracking-wide
                transition-all duration-200 ease-out
                ${isVisible
                    ? 'translate-y-0 opacity-100 scale-100'
                    : '-translate-y-2 opacity-0 scale-95'
                }
                ${getThemeStyles()}
            `}
            role="alert"
        >
            {/* <div className="pt-0.5">
                {getIcon()}
            </div> */}

            <div className="flex-1 min-w-0 pt-0">
                {/* [修改] 标题缩小到 9px，去掉了 margin-bottom，改为 leading-none 紧贴 */}
                <div className="font-bold opacity-50 text-[9px] leading-none mb-0.5">
                    [{toast.type?.toUpperCase() || 'SYS'}]
                </div>
                {/* [修改] 正文 11px，行高 leading-tight */}
                <div className="font-bold text-[11px] leading-tight break-words">
                    {toast.message}
                </div>
            </div>

            <button
                onClick={handleDismiss}
                // [修改] 按钮位置微调
                className="flex-shrink-0 -mr-0.5 -mt-0.5 p-0.5 hover:bg-black/20 active:translate-y-0.5 transition-all rounded-sm opacity-60 hover:opacity-100"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}