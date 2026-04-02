"use client";

import { createContext, useContext, useState } from "react";

const SidebarContext = createContext<{
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}>({ isOpen: false, toggle: () => {}, close: () => {} });

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        toggle: () => setIsOpen((p) => !p),
        close: () => setIsOpen(false),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
