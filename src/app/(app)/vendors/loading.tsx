import Header from "@/components/layout/Header";

export default function VendorsLoading() {
  return (
    <>
      <Header title="Vendors" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-5xl mx-auto animate-pulse">
          {/* Search bar */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 flex-1 max-w-sm bg-gray-100 rounded-lg" />
            <div className="h-10 w-32 bg-[#4272EF]/20 rounded-lg" />
          </div>

          {/* Vendor cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-32 bg-gray-200 rounded" />
                    <div className="h-3 w-20 bg-gray-100 rounded" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full bg-gray-50 rounded" />
                  <div className="h-3 w-3/4 bg-gray-50 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
