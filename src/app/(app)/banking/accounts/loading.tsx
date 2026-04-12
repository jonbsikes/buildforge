import Header from "@/components/layout/Header";

export default function BankAccountsLoading() {
  return (
    <>
      <Header title="Bank Accounts" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-5xl mx-auto animate-pulse">
          <div className="flex items-center justify-between mb-6">
            <div className="h-6 w-36 bg-gray-200 rounded" />
            <div className="h-10 w-32 bg-[#4272EF]/20 rounded-lg" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-32 bg-gray-200 rounded" />
                    <div className="h-3 w-20 bg-gray-100 rounded" />
                  </div>
                </div>
                <div className="h-7 w-28 bg-gray-200 rounded mb-1" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
