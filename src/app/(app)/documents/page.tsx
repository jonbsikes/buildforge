import Header from "@/components/layout/Header";

export const dynamic = "force-dynamic";

export default function DocumentsPage() {
  return (
    <>
      <Header title="Documents" />
      <main className="flex-1 p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          Documents — coming soon
        </div>
      </main>
    </>
  );
}
