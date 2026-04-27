import Header from "@/components/layout/Header";
import { TableSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header title="Payments" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <TableSkeleton rows={10} columns={6} />
        </div>
      </main>
    </>
  );
}
