import { 
    Search, 
    Users, 
    CheckCircle2, 
    Wifi, 
    WifiOff, 
    ShoppingBasket, 
    Activity, 
    Gamepad2 
  } from "lucide-react";
  import { useRouter } from "next/navigation";
  
  interface GameHeaderProps {
    stats: {
      totalPlayers: number;
      harvestableCount: number;
    };
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onSearch: () => void;
    isConnected: boolean;
    onOpenShop: () => void;
    onOpenActivity: () => void;
  }
  
  export function GameHeader({ 
    stats, 
    searchQuery, 
    setSearchQuery, 
    onSearch, 
    isConnected, 
    onOpenShop, 
    onOpenActivity 
  }: GameHeaderProps) {
    const router = useRouter();
  
    return (
      <header className="h-14 border-b-2 border-stone-700 bg-stone-800 flex-none flex items-center justify-between px-4 z-40 relative gap-4 shadow-md">
        {/* Left: Logo */}
        <div className="flex items-center gap-3 flex-none cursor-pointer" onClick={() => router.push('/')}>
          <div className="w-8 h-8 bg-orange-700 border-2 border-orange-500 flex items-center justify-center shadow-[2px_2px_0_0_#431407]">
            <Gamepad2 className="w-5 h-5 text-white" />
          </div>
          <div className="hidden md:block">
            <h1 className="text-lg font-bold tracking-tight text-white leading-none font-mono">FARM.OS</h1>
            <p className="text-[10px] text-stone-500 font-mono mt-0.5 uppercase">v4.12.0</p>
          </div>
        </div>
  
        {/* Middle: Search Bar */}
        <div className="flex-1 max-w-sm">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text"
              placeholder="SEARCH AGENT..."
              className="w-full bg-stone-900 border-2 border-stone-600 text-xs text-white pl-10 pr-3 py-1.5 outline-none focus:border-orange-500 focus:bg-stone-950 font-mono placeholder:text-stone-600 shadow-inner"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            />
          </div>
        </div>
  
        {/* Right: Controls */}
        <div className="flex items-center gap-2 sm:gap-4 text-sm flex-none">
          <div className="hidden sm:flex items-center gap-2 px-2 py-1 bg-stone-900 border border-stone-600">
            <Users className="w-3.5 h-3.5 text-stone-400" />
            <span className="font-mono font-bold text-white text-xs">{stats.totalPlayers}</span>
          </div>
  
          <div className="hidden sm:flex items-center gap-2 px-2 py-1 bg-stone-900 border border-stone-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            <span className="font-mono font-bold text-green-400 text-xs">{stats.harvestableCount}</span>
          </div>
          
          <div className="flex items-center gap-2">
             {isConnected ? (
              <Wifi className="w-4 h-4 text-green-600 drop-shadow-[0_0_5px_rgba(34,197,94,0.3)]" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            
            <button 
              onClick={onOpenShop}
              className="p-1.5 hover:bg-stone-700 active:bg-stone-900 border border-transparent hover:border-stone-500 rounded-none transition-all text-stone-400 hover:text-yellow-400"
              title="Market"
            >
              <ShoppingBasket className="w-4 h-4" />
            </button>
            
            <button 
              onClick={onOpenActivity} 
              className="lg:hidden p-1.5 hover:bg-stone-700 active:bg-stone-900 border border-transparent hover:border-stone-500 rounded-none transition-all text-stone-400 hover:text-green-400"
            >
              <Activity className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>
    );
  }