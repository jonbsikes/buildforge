import Header from "@/components/layout/Header";
import Skeleton, { ListSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header title="Manage" />
      <main className="flex-1 p-4 lg:p-8 overflow-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm space-y-3">
              <Skeleton className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl" />
              <Skeleton className="h-6" width={48} />
              <Skeleton className="h-3" width={96} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ListSkeleton rows={5} />
          </div>
          <div>
            <ListSkeleton rows={3} />
          </div>
        </div>
      </main>
    </>
  );
}
