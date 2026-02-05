import { useState, useRef, useEffect } from 'react';
import { X, Play, Trash2, Terminal, Activity, Sprout, Hammer, Settings, Key, Dog, Users } from 'lucide-react';
import * as api from '@/lib/api';

// 严格参照后端配置的 Crop ID
export const CROPS = [
  // [普通土地]
  { type: 'radish', name: '白萝卜' },
  { type: 'carrot', name: '胡萝卜' },
  { type: 'potato', name: '土豆' },
  { type: 'corn', name: '玉米' },

  // [红土地]
  { type: 'strawberry', name: '草莓' },
  { type: 'tomato', name: '番茄' },
  { type: 'watermelon', name: '西瓜' },

  // [黑土地]
  { type: 'pumpkin', name: '南瓜' }
];

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'success' | 'error' | 'info';
  method: string;
  data: any;
}

interface DebugSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlayerId?: string;
}

export function DebugSidebar({ isOpen, onClose, currentPlayerId }: DebugSidebarProps) {
  // --- 状态管理 ---
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // 全局参数状态
  const [position, setPosition] = useState<number>(0);
  // 默认选中第一个
  const [cropType, setCropType] = useState<string>(CROPS[0].type);
  const [playerName, setPlayerName] = useState<string>('TestPlayer');
  
  // API Key 状态
  const [apiKey, setApiKey] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
        const storedKey = localStorage.getItem('player_key');
        if (storedKey) setApiKey(storedKey);
    }
  }, []);

  const handleApiKeyChange = (val: string) => {
      setApiKey(val);
      localStorage.setItem('player_key', val);
  };
  
  // 自定义请求状态
  const [customEndpoint, setCustomEndpoint] = useState('/me');
  const [customMethod, setCustomMethod] = useState('GET');

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // --- 辅助函数 ---
  const addLog = (method: string, data: any, type: 'success' | 'error' | 'info' = 'success') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      method,
      data
    };
    setLogs(prev => [...prev, entry]);
  };

  const clearLogs = () => setLogs([]);

  const handleApiCall = async (name: string, fn: () => Promise<any>) => {
    addLog(name, 'Calling...', 'info');
    try {
      // 确保使用最新的 API Key
      if (apiKey) localStorage.setItem('player_key', apiKey);
      
      const result = await fn();
      addLog(name, result, 'success');
      
      // 创建用户后自动填充 Key
      if (name === 'Create Player' && result?.apiKey) {
          setApiKey(result.apiKey);
          localStorage.setItem('player_key', result.apiKey);
          addLog('System', `API Key Auto-filled: ${result.apiKey}`, 'info');
      }

    } catch (error: any) {
      addLog(name, { error: error.message || error }, 'error');
    }
  };

  // --- API 动作处理 ---
  const actions = {
    // 玩家
    createPlayer: () => handleApiCall('Create Player', () => api.publicApi.createPlayer(playerName)),
    getMe: () => handleApiCall('Get Me (By Token)', async () => {
        // 使用 api.ts 里的 createAgentApi 或者手动 fetch
        // 为了确保能拿到最新状态，这里直接调后端
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/me`, {
            headers: { 'X-API-KEY': apiKey }
        });
        if(!res.ok) throw new Error("Failed to fetch /me");
        return res.json();
    }),
    
    // 种植
    plant: () => handleApiCall(`Plant (${cropType} @ ${position})`, () => api.plant(Number(position), cropType)),
    harvest: () => handleApiCall(`Harvest (@ ${position})`, () => api.harvest(Number(position))),
    shovel: () => handleApiCall(`Shovel (@ ${position})`, () => api.shovelLand(Number(position))),
    
    // 照料
    water: () => handleApiCall(`Water (@ ${position})`, () => api.careLand(Number(position), 'water')),
    weed: () => handleApiCall(`Weed (@ ${position})`, () => api.careLand(Number(position), 'weed')),
    pest: () => handleApiCall(`Pest (@ ${position})`, () => api.careLand(Number(position), 'pest')),
    
    // 道具/升级
    expand: () => handleApiCall('Expand Land', () => api.expandLand()),
    upgrade: () => handleApiCall(`Upgrade Land (@ ${position})`, () => api.upgradeLand(Number(position))),
    fertilizerNormal: () => handleApiCall(`Fertilizer Normal (@ ${position})`, () => api.useFertilizer(Number(position), 'normal')),
    fertilizerHigh: () => handleApiCall(`Fertilizer High (@ ${position})`, () => api.useFertilizer(Number(position), 'high')),

    // [新增] 狗
    buyDog: () => handleApiCall('Buy Dog', () => api.buyDog()),
    feedDog: () => handleApiCall('Feed Dog', () => api.feedDog()),

    // [新增] 社交
    getFollowers: () => handleApiCall('Get Followers', () => api.getFollowers(playerId)),
    getFollowing: () => handleApiCall('Get Following', () => api.getFollowing(playerId)),

    // 自定义
    customRequest: async () => {
        addLog(`Custom ${customMethod}`, customEndpoint, 'info');
        try {
            const headers: any = { 'Content-Type': 'application/json' };
            if (apiKey) headers['X-API-KEY'] = apiKey;

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}${customEndpoint}`, {
                method: customMethod,
                headers,
                body: customMethod !== 'GET' ? JSON.stringify({}) : undefined
            });
            const data = await res.json();
            addLog(customEndpoint, data, res.ok ? 'success' : 'error');
        } catch (e: any) {
            addLog(customEndpoint, e.message, 'error');
        }
    }
  };

  const btnClass = "px-3 py-1.5 bg-stone-700 hover:bg-stone-600 text-stone-200 text-xs font-mono rounded border border-stone-600 active:translate-y-0.5 transition-all flex items-center justify-center gap-2";
  const groupTitleClass = "text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2 mt-4 flex items-center gap-1";

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      <div 
        className={`fixed top-0 right-0 h-full w-[90%] sm:w-[420px] bg-[#1c1917] border-l-2 border-orange-900/50 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex-none h-12 border-b border-stone-800 flex items-center justify-between px-4 bg-[#292524]">
          <div className="flex items-center gap-2 text-orange-500 font-mono font-bold">
            <Terminal className="w-4 h-4" />
            <span>DEBUG CONSOLE</span>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Actions */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar bg-[#1c1917]">
          
          {/* Player & Auth */}
          <section>
             <div className={groupTitleClass + " !mt-0"}><Activity className="w-3 h-3" /> Player & Auth</div>
             <div className="bg-stone-900/50 p-3 rounded border border-stone-800 space-y-3">
                 <div className="space-y-1">
                    <label className="text-[10px] text-stone-500 font-mono uppercase">Create New User</label>
                    <div className="flex gap-2">
                        <input 
                        value={playerName} 
                        onChange={(e) => setPlayerName(e.target.value)}
                        className="flex-1 bg-stone-800 border border-stone-700 text-stone-300 px-2 py-1 text-xs font-mono rounded focus:border-orange-500 outline-none"
                        placeholder="Name..."
                        />
                        <button className={btnClass + " !py-1"} onClick={actions.createPlayer}>Create</button>
                    </div>
                 </div>

                 <div className="space-y-1">
                    <label className="text-[10px] text-stone-500 font-mono uppercase flex items-center justify-between">
                        <span>Current API Key</span>
                        {apiKey && <span className="text-green-500 text-[9px]">ACTIVE</span>}
                    </label>
                    <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                            <Key className="w-3 h-3 absolute left-2 top-1.5 text-stone-500" />
                            <input 
                                value={apiKey} 
                                onChange={(e) => handleApiKeyChange(e.target.value)}
                                className="w-full bg-stone-950 border border-stone-700 text-yellow-500 pl-7 pr-2 py-1 text-[10px] font-mono rounded focus:border-yellow-600 outline-none truncate"
                                placeholder="Paste API Key..."
                            />
                        </div>
                        <button className={btnClass + " !py-1 w-20"} onClick={actions.getMe}>Check Me</button>
                    </div>
                 </div>
             </div>
          </section>

          {/* Context Params */}
          <section>
            <div className={groupTitleClass}><Settings className="w-3 h-3" /> Target Context</div>
            <div className="grid grid-cols-2 gap-3 bg-stone-900/50 p-3 rounded border border-stone-800">
              <div className="space-y-1">
                <label className="text-[10px] text-stone-400 font-mono">Land Position (0-17)</label>
                <input 
                  type="number" 
                  value={position}
                  onChange={(e) => setPosition(Number(e.target.value))}
                  className="w-full bg-stone-800 border border-stone-700 text-white px-2 py-1 text-xs font-mono rounded focus:border-orange-500 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-stone-400 font-mono">Crop Type</label>
                <select 
                  value={cropType}
                  onChange={(e) => setCropType(e.target.value)}
                  className="w-full bg-stone-800 border border-stone-700 text-white px-2 py-1 text-xs font-mono rounded focus:border-orange-500 outline-none"
                >
                  {CROPS.map(c => (
                      <option key={c.type} value={c.type}>
                          {c.name} ({c.type})
                      </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Farming Operations */}
          <section>
             <div className={groupTitleClass}><Sprout className="w-3 h-3" /> Farming Operations</div>
             <div className="grid grid-cols-3 gap-2">
                <button className={`${btnClass} text-green-200 border-green-900/50 bg-green-950/30 hover:bg-green-900/50`} onClick={actions.plant}>Plant</button>
                <button className={`${btnClass} text-yellow-200 border-yellow-900/50 bg-yellow-950/30 hover:bg-yellow-900/50`} onClick={actions.harvest}>Harvest</button>
                <button className={`${btnClass} text-red-200 border-red-900/50 bg-red-950/30 hover:bg-red-900/50`} onClick={actions.shovel}>Shovel</button>
             </div>
             
             <div className="mt-2 grid grid-cols-3 gap-2">
                <button className={btnClass} onClick={actions.water}>Water</button>
                <button className={btnClass} onClick={actions.weed}>Weed</button>
                <button className={btnClass} onClick={actions.pest}>Pest</button>
             </div>
          </section>

          {/* Upgrades & Items */}
          <section>
             <div className={groupTitleClass}><Hammer className="w-3 h-3" /> Shop & Upgrades</div>
             <div className="grid grid-cols-2 gap-2">
                <button className={btnClass} onClick={actions.expand}>Expand Land</button>
                <button className={btnClass} onClick={actions.upgrade}>Upgrade Land</button>
                <button className={btnClass} onClick={actions.fertilizerNormal}>Fertilizer (N)</button>
                <button className={btnClass} onClick={actions.fertilizerHigh}>Fertilizer (H)</button>
             </div>
          </section>
          
          {/* Watch Dog */}
          <section>
             <div className={groupTitleClass}><Dog className="w-3 h-3" /> Watch Dog</div>
             <div className="grid grid-cols-2 gap-2">
                <button className={btnClass} onClick={actions.buyDog}>Buy Dog </button>
                <button className={btnClass} onClick={actions.feedDog}>Feed Dog </button>
             </div>
          </section>

          {/* Social */}
          <section>
             <div className={groupTitleClass}><Users className="w-3 h-3" /> Social Network</div>
             <div className="grid grid-cols-2 gap-2">
                <button className={btnClass} onClick={actions.getFollowers}>Get Followers</button>
                <button className={btnClass} onClick={actions.getFollowing}>Get Following</button>
             </div>
          </section>

          {/* Manual Request */}
          <section>
             <div className={groupTitleClass}><Terminal className="w-3 h-3" /> Manual Request</div>
             <div className="flex gap-2">
                <select 
                   value={customMethod} 
                   onChange={(e) => setCustomMethod(e.target.value)}
                   className="w-18 bg-stone-800 border border-stone-700 text-white text-xs font-mono rounded px-1"
                >
                    <option>POST</option>
                    <option>GET</option>
                </select>
                <input 
                   value={customEndpoint} 
                   onChange={(e) => setCustomEndpoint(e.target.value)}
                   className="flex-1 bg-stone-800 border border-stone-700 text-stone-300 px-2 text-xs font-mono rounded"
                   placeholder="/api/..."
                />
                <button className={btnClass} onClick={actions.customRequest}>
                    <Play className="w-3 h-3" />
                </button>
             </div>
          </section>
        </div>

        {/* Log Area */}
        <div className="flex-none h-64 border-t-4 border-stone-800 bg-black p-0 flex flex-col">
            <div className="flex-none px-3 py-1 bg-stone-900 border-b border-stone-800 flex items-center justify-between">
                <span className="text-[10px] font-mono text-stone-400 font-bold uppercase">System Logs</span>
                <button onClick={clearLogs} className="text-[10px] text-stone-500 hover:text-red-400 flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Clear
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] custom-scrollbar">
                {logs.length === 0 && <div className="text-stone-700 italic text-center mt-8">Waiting for signals...</div>}
                {logs.map((log) => (
                    <div key={log.id} className="mb-3 border-b border-white/10 pb-2 last:border-0 group">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`font-bold ${
                                log.type === 'success' ? 'text-green-500' : 
                                log.type === 'error' ? 'text-red-500' : 'text-blue-400'
                            }`}>[{log.method}]</span>
                            <span className="text-stone-600 group-hover:text-stone-400 transition-colors">{log.timestamp}</span>
                        </div>
                        <pre className="text-stone-300 whitespace-pre-wrap break-all pl-2 border-l border-stone-800">
                            {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data)}
                        </pre>
                    </div>
                ))}
                <div ref={logsEndRef} />
            </div>
        </div>
      </div>
    </>
  );
}