import Header from "@/components/layout/Header";
import { ListSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header title="Notifications" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <ListSkeleton rows={8} />
      </main>
    </>
  );
}
