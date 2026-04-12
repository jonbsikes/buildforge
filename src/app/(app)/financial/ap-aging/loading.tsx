import Header from "@/components/layout/Header";

export default function APAgingLoading() {
  return (
    <>
      <Header title="AP Aging" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto animate-pulse">
          {/* ReportChrome header */}
          <div className="flex items-center justify-between mb-6">
            <div className="h-6 w-28 bg-gray-200 rounded" />
            <div className="flex gap-2">
              <div className="h-9 w-32 bg-gray-100 rounded-lg" />
              <div className="h-9 w-32 bg-gray-100 rounded-lg" />
            </div>
          </div>

          {/* Aging buckets */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm border-l-4 border-l-gray-200"
              >
                <div className="h-3 w-16 bg-gray-100 rounded mb-2" />
                <div className="h-6 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-3 w-20 bg-gray-200 rounded flex-1" />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-50">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} className="h-3 w-16 bg-gray-100 rounded flex-1" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
