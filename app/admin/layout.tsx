import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { ScissorsMark } from "@/components/site/ScissorsMark";

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
    <div className="min-h-screen bg-ink text-paper">
      <header className="flex items-center justify-between border-b border-ink-line px-6 py-4">
        <span className="flex items-center gap-2.5 font-display text-base">
          <ScissorsMark className="h-5 w-5 text-gold" />
          Painel administrativo
        </span>
        <nav className="flex items-center gap-6">
          <Link
            href="/admin"
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/agenda"
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Agenda
          </Link>
          <Link
            href="/admin/fila"
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Fila
          </Link>
          <Link
            href="/admin/configuracoes"
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Configurações
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-paper-dim transition-colors hover:text-paper"
            >
              Sair
            </button>
          </form>
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
