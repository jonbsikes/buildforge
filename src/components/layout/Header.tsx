import { createClient } from "@/lib/supabase/server";
import NotificationBell from "@/components/layout/NotificationBell";
import MobileMenuButton from "@/components/layout/MobileMenuButton";

export default async function Header({ title }: { title: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Derive a display name from the email (e.g. jon.b.sikes@gmail.com → "Jon Sikes")
  const emailLocal = user?.email?.split("@")[0] ?? "";
  const displayName = emailLocal
    .split(/[._]/)
    .filter((p) => p.length > 1)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .slice(0, 2)
    .join(" ") || emailLocal;

  const initials = displayName
    .split(" ")
    .map((p) => p.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

  return (
    <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <MobileMenuButton />
        <h1 classN