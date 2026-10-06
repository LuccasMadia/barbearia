"use client";

import { useActionState } from "react";
import { signIn } from "./actions";
import { ScissorsMark } from "@/components/site/ScissorsMark";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-6">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-6 border border-ink-line px-8 py-10"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <ScissorsMark className="h-7 w-7 text-gold" />
          <h1 className="font-display text-2xl text-paper">
            Painel administrativo
          </h1>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoFocus
            required
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-paper focus:border-gold"
          />
        </div>

        {state?.error && <p className="text-sm text-danger">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-sm bg-gold py-3 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
