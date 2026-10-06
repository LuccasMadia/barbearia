"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const password = String(formData.get("password") ?? "");
  const email = process.env.ADMIN_EMAIL;

  if (!email) {
    return { error: "Login não configurado. Defina ADMIN_EMAIL no servidor." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Senha incorreta." };
  }

  redirect("/admin");
}
