import Header from "@/components/layout/Header";

export default function IncomeStatementLoading() {
  return (
    <>
      <Header title="Income Statement" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-5xl mx-auto animate-pulse">
          {/* ReportChrome header */}
          <div className="flex items-center justify-between mb-6">
            <div className="h-6 w-40 bg-gray-200 rounded" />
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 w-16 bg-gray-100 rounded-full" />
              ))}
            </div>
          </div>

          {/* Report sections */}
          {Array.from({ length: 3 }).map((_, s) => (
            <div key={s} className="mb-6">
              <div className="h-4 w-28 bg-gray-200 rounded mb-3" />
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-4 py-3 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                  >
                    <div className="h-3 w-40 bg-gray-100 rounded" />
                    <div className="h-3 w-20 bg-gray-100 rounded" />
                  </div>
                ))}
                {/* Section total */}
                <div className="flex items-center justify-between px-4 py-3 border-t-2 border-[#4272EF]/20 bg-blue-50/30">
                  <div className="h-4 w-20 bg-gray-200 rounded" />
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
