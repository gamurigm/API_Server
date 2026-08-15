import Link from "next/link";

import { requireAdminPage } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function DocsPage() {
  await requireAdminPage();
  return <main className="shell"><header className="topbar"><div className="brand"><div className="brand-mark">FG</div><div><h1>Integración</h1><p>Contrato independiente del lenguaje</p></div></div><Link className="button" href="/">Volver al portal</Link></header>
    <section className="panel panel-body"><div className="eyebrow">Paso 1</div><h2>Conserva el login existente</h2><p>La aplicación utiliza el JWT RS256 que ya recibe de su emisor OIDC. El token debe incluir <code>iss</code>, <code>sub</code>, <code>aud</code>, <code>exp</code> e <code>iat</code>.</p>
      <div className="code">curl https://gateway.example.com/api/v1/gateway/market-data/quotes/NVDA \{"\n"}  -H &quot;Authorization: Bearer $ACCESS_TOKEN&quot;</div></section>
    <br /><section className="panel panel-body"><div className="eyebrow">Paso 2</div><h2>Cambia la URL base</h2><p>Apunta el cliente al prefijo del proveedor en el gateway; después se conservan el método, la ruta, el query y el JSON. El header <code>Authorization</code> autentica al usuario ante el gateway y nunca se reenvía al proveedor.</p>
      <div className="code">GET /api/v1/providers                 # catálogo autorizado{"\n"}ALL /api/v1/gateway/:provider/:path  # proxy{"\n"}GET /api/openapi                     # contrato del gateway</div></section>
    <br /><section className="panel panel-body"><div className="eyebrow">Respuestas</div><h2>Sin envolturas</h2><p>El gateway conserva status, <code>Content-Type</code> y cuerpo. Sus propios errores usan <code>error.code</code>, <code>error.message</code> y <code>error.requestId</code>.</p></section>
  </main>;
}
