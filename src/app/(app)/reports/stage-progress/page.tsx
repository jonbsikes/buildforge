import Header from "@/components/layout/Header";

export const dynamic = "force-dynamic";

export default function StageProgressPage() {
  return (
    <>
      <Header title="Stage Progress" />
      <main className="flex-1 p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          Stage Progress report — coming soon
        </div>
      </main>
    </>
  );
}
