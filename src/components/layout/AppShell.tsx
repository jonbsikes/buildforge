// @ts-nocheck
"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import MobileMenuButton from "./MobileMenuButton";
import { Menu } from "lucide-react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — offset for fixed sidebar on desktop */}
      <div className="flex-1 flex flex-col min-h-screen lg:pl-64">
        {/* Mobile top bar with hamburger */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="inline-flex items-center justify-center p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="text-gray-900 font-semibold text-base">BuildForge</span>
        </div>

        {children}
      </div>
   