import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin-login");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <span className="font-semibold">Painel administrativo</span>
        <form action={signOut}>
          <button type="submit" className="text-sm text-neutral-500 hover:underline">
            Sair
          </button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
