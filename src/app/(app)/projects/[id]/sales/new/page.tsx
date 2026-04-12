import Header from "@/components/layout/Header";
import NewSaleForm from "./NewSaleForm";

export const dynamic = "force-dynamic";

export default function NewSalePage() {
  return (
    <>
      <Header title="Add Sale" />
      <NewSaleForm />
    <