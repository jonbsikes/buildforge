import Header from "@/components/layout/Header";

export default function DashboardLoading() {
  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        {/* KPI skeleton grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse">
              <div className="flex items-center justify-between mb-3">
                <div className="h-4 w-20 bg-gray-200 rounded" />
                <div className="w-9 h-9 bg-gray-100 rounded-lg" />
              </div>
              <div className="h-7 w-16 bg-gray-200 rounded mb-1" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Projects skeleton */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 animate-pulse">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="h-5 w-24 bg-gray-200 rounded" />
              </div>
              <div className="divide-y divide-gray-50">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-5 py-4 flex items-center gap-4">
                    <div className="h-4 w-32 bg-gray-200 rounded" />
                    <div className="h-4 w-16 bg-gray-100 rounded" />
                    <div className="ml-auto h-4 w-20 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column skeleton */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-5 w-20 bg-gray-200 rounded mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-4 w-full bg-gray-100 rounded" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
