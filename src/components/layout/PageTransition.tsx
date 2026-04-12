"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Wraps page content and plays a subtle fade-slide entrance animation
 * every time the route changes.  Pure CSS — no animation library needed.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [animKey, setAnimKey] = useState(pathname);
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      setAnimKey(pathname);
    }
  }, [pathname]);

  return (
    <div key={animKey} className="animate-page-enter flex-1 flex flex-col min-h-0">
      {children}
    </div>
  );
}
