import Header from "@/components/layout/Header";

export default function DashboardLoading() {
  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-4 lg:p-8 overflow-auto">

        {/* ── Mobile: Alert Banner skeleton ── */}
        <div className="lg:hidden mb-4">
          <div className="bg-amber-50/50 border border-amber-100 rounded-xl px-4 py-3 animate-pulse flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100/60" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-36 bg-amber-100/80 rounded" />
              <div className="h-3 w-48 bg-amber-100/50 rounded" />
            </div>
          </div>
        </div>

        {/* ── Mobile: Quick Actions skeleton ── */}
        <div className="lg:hidden grid grid-cols-4 gap-2 mb-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-50 rounded-xl py-3 flex flex-col items-center gap-1.5 animate-pulse">
              <div className="w-6 h-6 bg-gray-200 rounded-lg" />
              <div className="h-3 w-10 bg-gray-200 rounded" />
            </div>
          ))}
        </div>

        {/* ── Mobile: KPI strip skeleton ── */}
        <div className="lg:hidden grid grid-cols-2 gap-3 mb-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-3.5 animate-pulse">
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 bg-gray-100 rounded-lg" />
                <div className="h-3 w-4 bg-gray-100 rounded" />
              </div>
              <div className="h-6 w-10 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>

        {/* ── Desktop: KPI strip skeleton ── */}
        <div className="hidden lg:grid grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm animate-pulse">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-gray-100 rounded-xl" />

              <div className="h-4 w-4 bg-gray-100 rounded" />
              </div>
              <div className="h-8 w-12 bg-gray-200 rounded mb-1" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>

        {/* ── This Week section skeleton (desktop) ── */}
        <div className="hidden lg:block mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm animate-pulse">
            <div className="h-5 w-24 bg-gray-200 rounded mb-4" />
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2.5">
                  <div className="h-4 w-20 bg-gray-100 rounded" />
                  <div className="h-3 w-full bg-gray-50 rounded" />
                  <div className="h-3 w-3/4 bg-gray-50 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Project Cards skeleton ── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3 animate-pulse">
            <div className="h-5 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-100 rounded" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm animate-pulse">
                {/* Header: name + progress ring */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 space-y-1.5 mr-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-gray-100 rounded-full" />
                      <div className="h-2.5 w-16 bg-gray-100 rounded" />
                    </div>
                    <div className="h-4 w-36 bg-gray-200 rounded" />
                    <div className="h-3 w-28 bg-gray-100 rounded" />
                  </div>
                  <div className="w-12 h-12 bg-gray-100 rounded-full" />
                </div>
                {/* Stage strip placeholder */}
                <div className="mb-3 py-2 px-2.5 bg-gray-50 rounded-lg">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <div className="h-2.5 w-6 bg-gray-200 rounded" />
                      <div className="h-2.5 w-full bg-gray-100 rounded" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2.5 w-6 bg-gray-200 rounded" />
                      <div className="h-2.5 w-3/4 bg-gray-100 rounded" />
                    </div>
                  </div>
                </div>
                {/* Budget bar placeholder */}
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <div className="h-3 w-20 bg-gray-100 rounded" />
                    <div className="h-3 w-16 bg-gray-100 rounded" />
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full" />
                </div>
                {/* Footer */}
                <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-100">
                  <div className="h-3 w-14 bg-gray-100 rounded" />
                  <div className="h-3 w-16 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Second section of cards ── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3 animate-pulse">
            <div className="h-5 w-28 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-100 rounded" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm animate-pulse">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 space-y-1.5 mr-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-gray-100 rounded-full" />
                      <div className="h-2.5 w-14 bg-gray-100 rounded" />
                    </div>
                    <div className="h-4 w-32 bg-gray-200 rounded" />
                    <div className="h-3 w-24 bg-gray-100 rounded" />
                  </div>
                  <div className="w-12 h-12 bg-gray-100 rounded-full" />
                </div>
                <div className="mb-3 py-2 px-2.5 bg-gray-50 rounded-lg">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <div className="h-2.5 w-6 bg-gray-200 rounded" />
                      <div className="h-2.5 w-full bg-gray-100 rounded" />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <div className="h-3 w-20 bg-gray-100 rounded" />
                    <div className="h-3 w-16 bg-gray-100 rounded" />
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full" />
                </div>
                <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-100">
                  <div className="h-3 w-14 bg-gray-100 rounded" />
                  <div className="h-3 w-16 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
