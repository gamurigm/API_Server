"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Icon } from "@/app/ui-icons";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

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

  async function signInLocally(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalLoading(true);
    setError(null);

    try {
      const response = await fetch("/auth/local", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Local-Login": "1",
        },
        body: "",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as
          { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "No se pudo iniciar la sesión local");
      }

      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo iniciar la sesión local");
      setLocalLoading(false);
    }
  }

  const localLoginEnabled = process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ENABLE_LOCAL_ADMIN_LOGIN === "true";

  return (
    <div className="auth-actions">
      {error ? <div aria-live="polite" className="notice error">{error}</div> : null}
      <button className="button oauth-button" disabled={loading || localLoading} onClick={signIn} type="button">
        <span className="google-mark">G</span>
        <span>{loading ? "Conectando…" : "Continuar con Google"}</span>
        <Icon className="button-end-icon" name="arrow" size={17} />
      </button>
      {localLoginEnabled ? (
        <>
          <div className="auth-divider"><span>Entorno de desarrollo</span></div>
          <form
            action="/auth/local"
            aria-busy={localLoading}
            className="local-login"
            method="post"
            onSubmit={signInLocally}
          >
            <span className="local-login-icon"><Icon name="code" /></span>
            <span className="local-login-copy"><strong>Acceso local seguro</strong><small>Credenciales gestionadas en el servidor</small></span>
            <button className="button compact" disabled={localLoading || loading} type="submit">
              {localLoading ? "Entrando…" : "Entrar"}<Icon name="arrow" size={15} />
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
