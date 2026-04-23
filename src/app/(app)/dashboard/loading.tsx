import Header from "@/components/layout/Header";

export default function DashboardLoading() {
  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-4 lg:p-8 overflow-auto">
        {/* Greeting + counter */}
        <div className="flex items-start justify-between mb-3 animate-pulse">
          <div className="h-7 w-56 bg-gray-200 rounded" />
          <div className="h-7 w-32 bg-gray-100 rounded-lg" />
        </div>

        {/* Slim metrics row */}
        <div className="flex gap-3 mb-6 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 w-24 bg-gray-100 rounded" />
          ))}
        </div>

        {/* Needs Attention hero */}
        <section className="mb-8">
          <div className="h-3 w-28 bg-gray-200 rounded mb-3 animate-pulse" />
          <div className="bg-white rounded-[var(--card-radius)] border border-[color:var(--card-border)] overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-[color:var(--border-hair)] animate-pulse"
              >
                <div className="w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-64 bg-gray-200 rounded" />
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>
                <div className="h-3 w-12 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </section>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="h-3 w-48 bg-gray-200 rounded mb-3 animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-[var(--card-radius)] border border-[color:var(--card-border)] p-[var(--card-padding)] animate-pulse"
                    style={{ borderLeft: "3px solid var(--border-weak)" }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 space-y-1.5 mr-3">
                        <div className="h-2.5 w-16 bg-gray-100 rounded" />
                        <div className="h-4 w-36 bg-gray-200 rounded" />
                        <div className="h-3 w-28 bg-gray-100 rounded" />
                      </div>
                      <div className="w-12 h-12 bg-gray-100 rounded-full" />
                    </div>
                    <div className="h-3 w-40 bg-gray-100 rounded mb-3" />
                    <div className="mb-3 py-2 px-2.5 bg-gray-50 rounded-lg">
                      <div className="space-y-1.5">
                        <div className="h-2.5 w-full bg-gray-100 rounded" />
                        <div className="h-2.5 w-3/4 bg-gray-100 rounded" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-100">
                      <div className="h-3 w-14 bg-gray-100 rounded" />
                      <div className="h-3 w-16 bg-gray-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-white rounded-[var(--card-radius)] border border-[color:var(--card-border)] overflow-hidden animate-pulse">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="h-4 w-20 bg-gray-200 rounded" />
              </div>
              <div className="divide-y divide-gray-50">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3">
                    <div className="h-3.5 w-36 bg-gray-100 rounded" />
                    <div className="h-3.5 w-6 bg-gray-200 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
