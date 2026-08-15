"use client";

import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginButton() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: new URL("/auth/callback", appUrl).toString() },
      });
      if (authError) throw authError;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo iniciar sesión");
      setLoading(false);
    }
  }

  const localLoginEnabled = process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ENABLE_LOCAL_ADMIN_LOGIN === "true";

  return (
    <>
      {error ? <div className="notice error">{error}</div> : null}
      <button className="button primary" disabled={loading} onClick={signIn} type="button">
        {loading ? "Conectando…" : "Continuar con Google"}
      </button>
      {localLoginEnabled ? (
        <form action="/auth/local" className="form local-login" method="post">
          <div className="eyebrow">Acceso local de prueba</div>
          <span>Credenciales gestionadas exclusivamente en el servidor.</span>
          <button className="button" type="submit">Entrar localmente con un clic</button>
        </form>
      ) : null}
    </>
  );
}
