"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "./SidebarContext";

export default function MobileMenuButton() {
  const { toggle } = useSidebar();
  return (
    <button
      onClick={toggle}
      className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
      aria-label="Open menu"
    >
      <Menu size={20} />
    </button>
  );
}
