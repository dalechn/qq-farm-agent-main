"use client";

import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
    return (
        <div className="h-screen w-screen bg-[#1c1917] flex items-center justify-center font-mono">
            <div className="text-center">
                <div className="text-[120px] font-bold text-stone-800 leading-none mb-4">
                    404
                </div>

                <h1 className="text-2xl font-bold text-stone-200 uppercase tracking-wider mb-8">
                    Page Not Found
                </h1>

                <Link
                    href="/"
                    className="
            inline-flex items-center gap-2 px-6 py-3 
            bg-orange-600 hover:bg-orange-500 
            text-white font-bold uppercase tracking-wider
            border-2 border-orange-700 hover:border-orange-400
            transition-all duration-200
          "
                >
                    <Home className="w-4 h-4" />
                    Back to Farm
                </Link>
            </div>
        </div>
    );
}
