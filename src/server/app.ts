import { Hono, type Handler } from "hono";

import * as adminAccess from "@/http/routes/admin/access/route";
import * as adminApiKeys from "@/http/routes/admin/api-keys/route";
import * as adminApiKey from "@/http/routes/admin/api-keys/[id]/route";
import * as adminApplications from "@/http/routes/admin/applications/route";
import * as adminAudit from "@/http/routes/admin/audit/route";
import * as adminCredentials from "@/http/routes/admin/credentials/route";
import * as adminIdentityProviders from "@/http/routes/admin/identity-providers/route";
import * as adminOpenApiImport from "@/http/routes/admin/openapi/import/route";
import * as adminOrigins from "@/http/routes/admin/origins/route";
import * as adminProviders from "@/http/routes/admin/providers/route";
import * as adminResource from "@/http/routes/admin/resources/[resource]/[id]/route";
import * as adminRoutes from "@/http/routes/admin/routes/route";
import * as adminSession from "@/http/routes/admin/session/route";
import * as health from "@/http/routes/health/route";
import * as openApi from "@/http/routes/openapi/route";
import * as providers from "@/http/routes/v1/providers/route";
import { handleGatewayOptions, handleGatewayRoute } from "@/http/routes/v1/gateway";
import { GatewayError } from "@/lib/errors";

type RequestHandler = (request: Request) => Response | Promise<Response>;

export interface HttpRouteOverrides {
  health?: RequestHandler;
  providers?: RequestHandler;
  gateway?: RequestHandler;
}

function requestHandler(handler: RequestHandler): Handler {
  return (context) => handler(context.req.raw);
}

export function createHttpApp(overrides: HttpRouteOverrides = {}): Hono {
  const app = new Hono();

  app.use("*", async (context, next) => {
    await next();
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
    context.header("Referrer-Policy", "no-referrer");
    context.header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'");
    context.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  });

  app.use("/api/admin/*", async (context, next) => {
    await next();
    context.header("Cache-Control", "no-store");
  });

  app.get("/", (context) => context.json({
    service: "federated-api-gateway",
    health: "/api/health",
  }));

  app.get("/api/health", requestHandler(overrides.health ?? (() => health.GET())));
  app.get("/api/openapi", requestHandler((request) => openApi.GET(request)));
  app.get("/api/v1/providers", requestHandler(overrides.providers ?? providers.GET));
  app.options("/api/v1/providers", requestHandler(providers.OPTIONS));

  app.post("/api/admin/session", requestHandler(adminSession.POST));
  app.delete("/api/admin/session", requestHandler(adminSession.DELETE));

  app.get("/api/admin/applications", requestHandler(adminApplications.GET));
  app.post("/api/admin/applications", requestHandler(adminApplications.POST));
  app.get("/api/admin/providers", requestHandler(adminProviders.GET));
  app.post("/api/admin/providers", requestHandler(adminProviders.POST));
  app.get("/api/admin/routes", requestHandler(adminRoutes.GET));
  app.post("/api/admin/routes", requestHandler(adminRoutes.POST));
  app.get("/api/admin/access", requestHandler(adminAccess.GET));
  app.post("/api/admin/access", requestHandler(adminAccess.POST));
  app.get("/api/admin/origins", requestHandler(adminOrigins.GET));
  app.post("/api/admin/origins", requestHandler(adminOrigins.POST));
  app.get("/api/admin/credentials", requestHandler(adminCredentials.GET));
  app.post("/api/admin/credentials", requestHandler(adminCredentials.POST));
  app.get("/api/admin/identity-providers", requestHandler(adminIdentityProviders.GET));
  app.post("/api/admin/identity-providers", requestHandler(adminIdentityProviders.POST));
  app.get("/api/admin/audit", requestHandler(adminAudit.GET));
  app.post("/api/admin/openapi/import", requestHandler(adminOpenApiImport.POST));
  app.patch("/api/admin/resources/:resource/:id", (context) =>
    adminResource.PATCH(context.req.raw, context.req.param("resource"), context.req.param("id")));
  app.delete("/api/admin/resources/:resource/:id", (context) =>
    adminResource.DELETE(context.req.raw, context.req.param("resource"), context.req.param("id")));
  app.get("/api/admin/api-keys", requestHandler(adminApiKeys.GET));
  app.post("/api/admin/api-keys", requestHandler(adminApiKeys.POST));
  app.delete("/api/admin/api-keys/:id", (context) =>
    adminApiKey.DELETE(context.req.raw, context.req.param("id")));

  const gateway = requestHandler(overrides.gateway ?? handleGatewayRoute);
  app.on(["GET", "POST", "PUT", "PATCH", "DELETE"], "/api/v1/gateway/:provider/*", gateway);
  app.options("/api/v1/gateway/:provider/*", requestHandler(handleGatewayOptions));

  app.notFound((context) => context.json({
    error: { code: "route_not_found", message: "The requested API route does not exist" },
  }, 404));

  app.onError((error) => {
    const requestId = crypto.randomUUID();
    const known = error instanceof GatewayError ? error : null;
    return Response.json({
      error: {
        code: known?.code ?? "internal_error",
        message: known?.expose ? known.message : "Unexpected server error",
        requestId,
      },
    }, {
      status: known?.status ?? 500,
      headers: {
        "Cache-Control": "no-store",
        "X-Gateway-Request-Id": requestId,
      },
    });
  });

  return app;
}

export const app = createHttpApp();
