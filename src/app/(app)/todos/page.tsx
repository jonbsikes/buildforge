import Header from "@/components/layout/Header";
import TodosClient from "@/components/todos/TodosClient";


export default function TodosPage() {
  return (
    <>
      <Header title="To-Do List" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <TodosClient />
      </main>
    </>
  );
}
