import { redirect } from "next/navigation";

/** /reports defaults to the Job Cost report. The old summary lives at /reports/overview. */
export default function ReportsPage() {
  redirect("/reports/job-cost");
}
