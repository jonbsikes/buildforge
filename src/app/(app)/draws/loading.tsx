import Header from "@/components/layout/Header";

export default function DrawsLoading() {
  return (
    <>
      <Header title="Draw Requests" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto animate-pulse">
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="h-3 w-16 bg-gray-100 rounded mb-2" />
                <div className="h-7 w-12 bg-gray-200 rounded" />
              </div>
            ))}
          </div>

          {/* Table skeleton */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="h-3 w-16 bg-gray-200 rounded" />
              <div className="h-3 w-24 bg-gray-200 rounded" />
              <div className="h-3 w-20 bg-gray-200 rounded flex-1" />
              <div className="h-3 w-20 bg-gray-200 rounded" />
              <div className="h-3 w-16 bg-gray-200 rounded" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-50">
                <div className="h-3 w-12 bg-gray-100 rounded" />
                <div className="h-3 w-28 bg-gray-100 rounded" />
                <div className="h-3 w-32 bg-gray-50 rounded flex-1" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
                <div className="h-5 w-16 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
