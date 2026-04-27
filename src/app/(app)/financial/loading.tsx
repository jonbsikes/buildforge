import Header from "@/components/layout/Header";
import { Skeleton, TableSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header title="Financial" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                <Skeleton className="h-3" width={80} />
                <Skeleton className="h-7 mt-2" width={120} />
              </div>
            ))}
          </div>
          <TableSkeleton rows={6} columns={5} />
        </div>
      </main>
    </>
  );
}
