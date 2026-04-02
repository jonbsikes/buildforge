import Sidebar from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";

export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}
