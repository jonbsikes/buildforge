import Header from "@/components/layout/Header";
import NewProjectForm from "./NewProjectForm";

export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  return (
    <>
      <Header title="New Project" />
      <NewProjectForm />
    </>
  );
}
