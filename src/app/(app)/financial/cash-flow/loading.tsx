import Header from "@/components/layout/Header";
import { TableSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header title="Cash Flow Statement" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <TableSkeleton rows={12} columns={3} />
        </div>
      </main>
    </>
  );
}
