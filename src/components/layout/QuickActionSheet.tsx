"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useCallback, useEffect } from "react";
import { ClipboardList, Camera, Check, FileText } from "lucide-react";
import { haptic } from "@/lib/haptics";

interface QuickActionSheetProps {
  onClose: () => void;
}

const actions = [
  {
    icon: ClipboardList,
    label: "Field Log",
    desc: "Log site activity",
    color: "bg-[#4272EF]",
    href: "/field-logs",
  },
  {
    icon: Camera,
    label: "Snap Invoice",
    desc: "Photograph & process",
    color: "bg-emerald-500",
    href: "/invoices/upload",
  },
  {
    icon: Check,
    label: "New To-Do",
    desc: "Create a task",
    color: "bg-purple-500",
    href: "/todos",
  },
  {
    icon: FileText,
    label: "New Invoice",
    desc: "Enter manually",
    color: "bg-amber-500",
    href: "/invoices/upload",
  },
];

const DISMISS_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 0.5;

export default function QuickActionSheet({ onClose }: QuickActionSheetProps) {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dragStart = useRef<{ y: number; time: number } | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    haptic("light");
    setTimeout(onClose, 250);
  }, [onClose]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragStart.current = { y: touch.clientY, time: Date.now() };
    setIsDragging(true);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragStart.current) return;
    const dy = e.touches[0].clientY - dragStart.current.y;
    setDragY(Math.max(0, dy));
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!dragStart.current) return;
    const elapsed = Date.now() - dragStart.current.time;
    const velocity = dragY / elapsed;

    if (dragY > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      handleClose();
    } else {
      setDragY(0);
    }

    setIsDragging(false);
    dragStart.current = null;
  }, [dragY, handleClose]);

  function handleAction(href: string) {
    haptic("medium");
    handleClose();
    setTimeout(() => router.push(href), 260);
  }

  const backdropOpacity = isClosing ? 0 : Math.max(0, 1 - dragY / 300);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:hidden">
      <div
        className={"absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200"}
        style={{ opacity: backdropOpacity }}
        onClick={handleClose}
      />

      <div
        ref={sheetRef}
        className={`relative w-full max-w-lg bg-white rounded-t-2xl px-5 pt-3 pb-safe z-10 ${
          isClosing ? "animate-slide-down" : isDragging ? "sheet-dragging" : "animate-slide-up"
        }`}
        style={{
          transform: isDragging ? `translateY(${dragY}px)` : undefined,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="w-10 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 cursor-grab active:cursor-grabbing" />

        <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>

        <div className="grid grid-cols-2 gap-3 pb-4">
          {actions.map(({ icon: Icon, label, desc, color, href }) => (
            <button
              key={label}
              onClick={() => handleAction(href)}
              className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 active:scale-[0.97] transition-all text-left"
            >
              <div
                className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center shrink-0`}
              >
                <Icon size={20} color="white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
