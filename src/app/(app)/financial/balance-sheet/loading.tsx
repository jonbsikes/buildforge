import Header from "@/components/layout/Header";

export default function BalanceSheetLoading() {
  return (
    <>
      <Header title="Balance Sheet" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-5xl mx-auto animate-pulse">
          {/* ReportChrome header */}
          <div className="flex items-center justify-between mb-6">
            <div className="h-6 w-36 bg-gray-200 rounded" />
            <div className="flex gap-2">
              <div className="h-9 w-36 bg-gray-100 rounded-lg" />
              <div className="h-9 w-20 bg-gray-100 rounded-lg" />
            </div>
          </div>

          {/* Assets / Liabilities / Equity sections */}
          {["Assets", "Liabilities", "Equity"].map((section) => (
            <div key={section} className="mb-6">
              <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-4 py-3 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                  >
                    <div className="h-3 w-44 bg-gray-100 rounded" />
                    <div className="h-3 w-24 bg-gray-100 rounded" />
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3 border-t-2 border-[#4272EF]/20 bg-blue-50/30">
                  <div className="h-4 w-28 bg-gray-200 rounded" />
                  <div className="h-4 w-24 bg-gray-200 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
