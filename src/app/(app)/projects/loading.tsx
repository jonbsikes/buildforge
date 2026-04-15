import Header from "@/components/layout/Header";

export default function ProjectsLoading() {
  return (
    <>
      <Header title="Projects" />
      <main className="flex-1 p-4 lg:p-8 overflow-auto">
        {/* Search / filter bar skeleton */}
        <div className="flex items-center gap-3 mb-6 animate-pulse">
          <div className="h-10 flex-1 max-w-sm bg-gray-100 rounded-lg" />
          <div className="h-10 w-28 bg-gray-100 rounded-lg hidden lg:block" />
          <div className="h-10 w-10 bg-gray-100 rounded-lg lg:hidden" />
        </div>

        {/* Subdivision group header */}
        <div className="h-5 w-40 bg-gray-200 rounded mb-4 animate-pulse" />

        {/* Project cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm animate-pulse"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
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
              {/* Stage strip */}
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
              {/* Budget bar */}
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
      </main>
    </>
  );
}
