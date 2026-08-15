import { redirect } from "next/navigation";

import { LoginButton } from "./login-button";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const sensitiveParameters = [
    "email",
    "username",
    "password",
    "passwd",
    "secret",
    "token",
    "access_token",
    "refresh_token",
  ];

  if (sensitiveParameters.some((parameter) => parameter in params)) {
    redirect("/login?error=sensitive_parameters_removed");
  }

  const errorMessages: Record<string, string> = {
    local_login_not_configured: "El acceso local no está configurado.",
    local_login_failed: "No se pudo iniciar la sesión local.",
    local_login_request_rejected: "Recarga esta página y vuelve a intentar el acceso local.",
    sensitive_parameters_removed: "Se eliminaron credenciales inseguras de la URL.",
  };
  const errorCode = typeof params.error === "string" ? params.error : undefined;
  const error = errorCode
    ? errorMessages[errorCode] ?? "No se pudo iniciar sesión."
    : null;

  return (
    <main className="login-shell">
      <section className="panel login-card">
        <div className="eyebrow">Federated API Gateway</div>
        <h1>Administración segura</h1>
        <p>
          Google OAuth protege el portal. Las aplicaciones consumidoras utilizan sus propios JWT
          RS256 y no necesitan iniciar sesión aquí.
        </p>
        {error ? <div className="notice error">{error}</div> : null}
        <LoginButton />
      </section>
    </main>
  );
}
