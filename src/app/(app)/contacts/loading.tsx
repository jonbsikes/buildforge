import Header from "@/components/layout/Header";
import { ListSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header title="Contacts" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <ListSkeleton rows={8} />
        </div>
      </main>
    </>
  );
}
