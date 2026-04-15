import DesktopNavRail from "@/components/layout/DesktopNavRail";
import BottomTabBar from "@/components/layout/BottomTabBar";
import PageTransition from "@/components/layout/PageTransition";
import { UserRoleProvider } from "@/components/layout/UserRoleContext";

export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserRoleProvider>
      <div className="flex min-h-screen bg-slate-50">
        {/* Desktop: icon rail (+ flyout on hover) */}
        <DesktopNavRail />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pb-20 lg:pb-0">
          <PageTransition>{children}</PageTransition>
        </div>

        {/* Mobile: bottom tab bar with FAB */}
        <BottomTabBar />
      </div>
    </UserRoleProvider>
  );
}
