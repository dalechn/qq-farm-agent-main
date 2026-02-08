import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Users,
  Loader2,
  ArrowRight,
  ArrowLeftRight // [新增] 用于显示互相关注图标
} from 'lucide-react';
import { type FollowUser, publicApi, getAuthHeaders } from '@/lib/api';

// [新增] 本地扩充接口，以支持 isMutual 字段（假设后端会返回此字段）
interface ExtendedFollowUser extends FollowUser {
  isMutual?: boolean;
}

interface UserListSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'following' | 'followers';
  playerId: string;
}

export function UserListSidebar({ isOpen, onClose, type, playerId }: UserListSidebarProps) {
  const router = useRouter();

  const [data, setData] = useState<ExtendedFollowUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); // [新增]

  // 分页状态
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 初始化或重置
  useEffect(() => {
    if (isOpen && playerId) {
      setPage(1);
      setData([]);
      setError(null);
      setHasMore(true);
      fetchData(1, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, type, playerId]);

  const fetchData = async (pageNum: number, isLoadMore: boolean) => {
    try {
      if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
      }

      const apiFunc = type === 'following' ? publicApi.getFollowing : publicApi.getFollowers;
      const res = await apiFunc(playerId, pageNum, 20, getAuthHeaders());


      // [Safety Check] Ensure response is valid
      if (!res || !res.data || !res.pagination) {
        // console.warn("Invalid API response:", res);
        // @ts-ignore check for error property from weird fetchWithHandling return
        const errorMsg = res?.error?.error || res?.reason || "Failed to load list";
        if (!isLoadMore) setError(errorMsg);
        return;
      }

      if (isLoadMore) {
        // [类型断言] 这里假设 API 返回的数据可能包含 isMutual
        setData(prev => [...prev, ...res.data as ExtendedFollowUser[]]);
      } else {
        setData(res.data as ExtendedFollowUser[]);
      }

      setHasMore(res.pagination.hasMore);

    } catch (err) {
      console.warn(err);
      if (!isLoadMore) setError("Network error occurred");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!hasMore || isLoadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchData(nextPage, true);
  };

  const handleUserClick = (username: string) => {
    onClose();
    router.push(`/u/${username}`);
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-[90%] sm:w-[360px] bg-[#1c1917] border-l-2 border-stone-800 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        {/* Header */}
        <div className="flex-none h-12 border-b-2 border-stone-700 bg-[#292524] flex items-center justify-between px-4 select-none">
          <div className="flex items-center gap-2 text-stone-200 font-mono font-bold uppercase">
            <Users className="w-4 h-4 text-orange-500" />
            <span className="tracking-widest">{type} LIST</span>
          </div>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-white transition-colors hover:bg-red-900/50 p-1 rounded-sm"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-[#1c1917] custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 text-stone-500 animate-pulse">
              <Loader2 className="w-6 h-6 animate-spin mb-2 text-orange-500" />
              <span className="text-xs font-mono uppercase tracking-wider">Scanning Data...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 text-red-400 font-mono text-xs uppercase p-4 text-center">
              <span className="mb-2 font-bold">Error Loading Data</span>
              <span className="text-stone-500">{error}</span>
              <button
                onClick={() => fetchData(1, false)}
                className="mt-4 px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded border border-stone-600 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-stone-600 font-mono text-xs uppercase">
              <Users className="w-8 h-8 mb-2 opacity-20" />
              <span>No users found</span>
            </div>
          ) : (
            <div className="flex flex-col border-t border-stone-800">
              {data.map((user, index) => (
                <div
                  key={`${user.id}-${index}`}
                  onClick={() => handleUserClick(user.name)}
                  className="
                    group relative p-3 cursor-pointer transition-all duration-100 flex items-center gap-3
                    font-mono border-b border-stone-800
                    hover:bg-stone-800/50 hover:pl-4
                  "
                >
                  {/* Avatar Section */}
                  <div className="relative flex-none">
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-10 h-10 bg-stone-900 border border-stone-600 object-cover group-hover:border-stone-400 transition-colors"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>

                  {/* Info Section */}
                  <div className="flex flex-col flex-1 min-w-0 justify-center">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-stone-300 truncate group-hover:text-orange-400 transition-colors">
                          {user.name}
                        </span>

                        {/* [新增] 互相关注标记 */}
                        {user.isMutual && (
                          <div className="flex-none flex items-center gap-1 bg-stone-800/80 px-1.5 py-0.5 rounded border border-stone-600/50" title="Mutually Following">
                            <ArrowLeftRight className="w-2.5 h-2.5 text-green-400" />
                            <span className="text-[8px] text-stone-400 font-mono uppercase leading-none">Mutual</span>
                          </div>
                        )}
                      </div>

                      {/* Jump Icon Hint */}
                      <ArrowRight className="flex-none w-3 h-3 text-stone-600 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                    </div>

                    {/* User ID */}
                    <div className="mt-0.5">
                      <span className="text-[9px] text-stone-600 font-mono">
                        ID: {user.id.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Load More Button */}
              {hasMore && (
                <div className="p-4 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="
                      text-[10px] font-mono uppercase tracking-widest 
                      text-stone-500 hover:text-orange-400 
                      border-b border-dotted border-stone-600 hover:border-orange-400
                      disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center gap-2
                    "
                  >
                    {isLoadingMore ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> LOADING...</>
                    ) : (
                      "LOAD MORE AGENTS"
                    )}
                  </button>
                </div>
              )}

              {!hasMore && data.length > 0 && (
                <div className="py-4 text-center text-[10px] text-stone-700 font-mono">
                  // END OF LIST //
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}