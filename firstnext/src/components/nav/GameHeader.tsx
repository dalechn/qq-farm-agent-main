import {
  Search,
  Users,
  CheckCircle2,
  Wifi,
  WifiOff,
  ShoppingBasket,
  Activity,
  Gamepad2,
  Globe
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n, type Locale } from "@/lib/i18n";
import { useState } from "react";

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
  const { locale, setLocale } = useI18n();
  const [showLangMenu, setShowLangMenu] = useState(false);

  const toggleLocale = () => {
    setLocale(locale === 'zh' ? 'en' : 'zh');
    setShowLangMenu(false);
  };

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
        {/* <div className="hidden sm:flex items-center gap-2 px-2 py-1 bg-stone-900 border border-stone-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            <span className="font-mono font-bold text-green-400 text-xs">{stats.harvestableCount}</span>
          </div> */}

        <div className="flex items-center gap-2">
          {/* Language Switch */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="p-1.5 hover:bg-stone-700 active:bg-stone-900 border border-transparent hover:border-stone-500 rounded-none transition-all text-stone-400 hover:text-white"
              title="Language"
            >
              <Globe className="w-4 h-4" />
            </button>

            {showLangMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowLangMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-[#1c1917] border border-stone-600 shadow-lg z-20 overflow-hidden min-w-[80px]">
                  <button
                    onClick={toggleLocale}
                    className={`w-full px-3 py-1.5 text-left text-xs font-mono hover:bg-stone-700 transition-colors flex items-center gap-2 ${locale === 'zh' ? 'text-orange-400 bg-stone-800' : 'text-stone-300'
                      }`}
                  >
                    <span className="w-4 text-center">🇨🇳</span>
                    <span>中文</span>
                  </button>
                  <button
                    onClick={toggleLocale}
                    className={`w-full px-3 py-1.5 text-left text-xs font-mono hover:bg-stone-700 transition-colors flex items-center gap-2 ${locale === 'en' ? 'text-orange-400 bg-stone-800' : 'text-stone-300'
                      }`}
                  >
                    <span className="w-4 text-center">🇺🇸</span>
                    <span>EN</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* X Social Button */}

          {/* {isConnected ? (
              <Wifi className="w-4 h-4 text-green-600 drop-shadow-[0_0_5px_rgba(34,197,94,0.3)]" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )} */}

          <button
            onClick={onOpenShop}
            className="p-1.5 hover:bg-stone-700 active:bg-stone-900 border border-transparent hover:border-stone-500 rounded-none transition-all text-stone-400 hover:text-yellow-400"
            title="Market"
          >
            <ShoppingBasket className="w-5 h-5" />
          </button>

          <button
            onClick={onOpenActivity}
            className="lg:hidden p-1.5 hover:bg-stone-700 active:bg-stone-900 border border-transparent hover:border-stone-500 rounded-none transition-all text-stone-400 hover:text-green-400"
          >
            <Activity className="w-4 h-4" />
          </button>

          <a
            href="https://x.com/420dotmeme"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-stone-700 active:bg-stone-900 border border-transparent hover:border-stone-500 rounded-none transition-all text-stone-400 hover:text-white"
            title="X"
          >
            <svg className="w-4 h-4" viewBox="0 0 50 45" fill="currentColor">
              <path d="M39.2,0h7.6L30.2,19.1L49.8,45H34.4l-12-15.7L8.6,45H1l17.8-20.4L0,0h15.8l10.9,14.4L39.2,0z M36.5,40.4h4.2L13.5,4.3H8.9 L36.5,40.4z" />
            </svg>
          </a>

        </div>
      </div>
    </header>
  );
}