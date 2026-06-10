import Header from "@/components/layout/Header";
import Skeleton from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header title="Settings" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-5xl flex flex-col lg:flex-row gap-6 lg:gap-10">
          <div className="lg:w-48 lg:flex-shrink-0 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded-lg" />
            ))}
          </div>
          <div className="flex-1 space-y-6 min-w-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <Skeleton className="h-4" width={120} />
                <Skeleton className="h-3" width="60%" />
                <Skeleton className="h-10 rounded-lg" width="100%" />
                <Skeleton className="h-10 rounded-lg" width="100%" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
