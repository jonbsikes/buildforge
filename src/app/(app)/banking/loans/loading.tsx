import Header from "@/components/layout/Header";
import { ListSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header title="Loans" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <ListSkeleton rows={6} />
        </div>
      </main>
    </>
  );
}
