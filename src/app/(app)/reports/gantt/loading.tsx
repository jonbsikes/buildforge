import Header from "@/components/layout/Header";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header title="Gantt Chart" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4" width={140} />
              <Skeleton className="h-6 flex-1" />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
