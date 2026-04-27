import Header from "@/components/layout/Header";
import SelectionsReportClient from "@/components/reports/SelectionsReportClient";


export default function SelectionsReportPage() {
  return (
    <>
      <Header title="Selections Report" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <SelectionsReportClient />
      </main>
    </>
  );
}
