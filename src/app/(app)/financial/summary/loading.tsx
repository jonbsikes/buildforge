import Header from "@/components/layout/Header";

export default function FinancialSummaryLoading() {
  return (
    <>
      <Header title="Financial Summary" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto animate-pulse">
          {/* ReportChrome header area */}
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-1">
              <div className="h-6 w-44 bg-gray-200 rounded" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-20 bg-gray-100 rounded-lg" />
              <div className="h-9 w-20 bg-gray-100 rounded-lg" />
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm border-l-4 border-l-gray-200"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 bg-gray-100 rounded-lg" />
                  <div className="h-3 w-20 bg-gray-100 rounded" />
                </div>
                <div className="h-7 w-28 bg-gray-200 rounded" />
              </div>
            ))}
          </div>

          {/* Table skeleton */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="h-4 w-36 bg-gray-200 rounded" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`flex items-center gap-4 px-4 py-3 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
              >
                <div className="h-3 w-36 bg-gray-100 rounded flex-1" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
