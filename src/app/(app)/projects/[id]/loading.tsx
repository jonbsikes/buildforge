export default function ProjectDetailLoading() {
  return (
    <main className="flex-1 p-4 lg:p-8 overflow-auto">
      <div className="animate-pulse">
        {/* Back button + title */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-gray-100 rounded-lg lg:hidden" />
          <div className="h-6 w-48 bg-gray-200 rounded" />
        </div>

        {/* Mobile: project identity card */}
        <div className="lg:hidden bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 bg-gray-100 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-40 bg-gray-200 rounded" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          </div>
        </div>

        {/* Mobile: quick stats strip */}
        <div className="lg:hidden flex gap-3 overflow-hidden mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 min-w-[120px]">
              <div className="h-3 w-12 bg-gray-100 rounded mb-2" />
              <div className="h-5 w-16 bg-gray-200 rounded" />
            </div>
          ))}
        </div>

        {/* Desktop: detail grid */}
        <div className="hidden lg:grid grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="h-3 w-16 bg-gray-100 rounded mb-2" />
              <div className="h-6 w-24 bg-gray-200 rounded" />
            </div>
          ))}
        </div>

        {/* Tab bar skeleton */}
        <div className="flex gap-2 mb-6 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-20 bg-gray-100 rounded-full shrink-0"
            />
          ))}
        </div>

        {/* Content area skeleton */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="h-5 w-32 bg-gray-200 rounded" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 w-8 bg-gray-100 rounded" />
              <div className="h-4 flex-1 bg-gray-50 rounded" />
              <div className="h-4 w-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
