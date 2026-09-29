import { withDbTransaction } from "@/lib/db/pool";

export interface ImportedRoute {
  provider_id: string;
  method: string;
  path_template: string;
  operation_id: string;
  description: string | null;
  required_scopes: string[];
  allowed_request_headers: string[];
  allowed_response_headers: string[];
  supports_sse: boolean;
  enabled: boolean;
  source: "openapi";
}

export function importOpenApiRoutes(routes: ImportedRoute[]): Promise<number> {
  return withDbTransaction(async (client) => {
    for (const route of routes) {
      await client.query(
        `INSERT INTO public.provider_routes
         (provider_id, method, path_template, operation_id, description, required_scopes,
          allowed_request_headers, allowed_response_headers, supports_sse, enabled, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (provider_id, method, path_template) DO UPDATE SET
           operation_id = EXCLUDED.operation_id,
           description = EXCLUDED.description,
           required_scopes = EXCLUDED.required_scopes,
           allowed_request_headers = EXCLUDED.allowed_request_headers,
           allowed_response_headers = EXCLUDED.allowed_response_headers,
           supports_sse = EXCLUDED.supports_sse,
           enabled = EXCLUDED.enabled,
           source = EXCLUDED.source`,
        [route.provider_id, route.method, route.path_template, route.operation_id,
          route.description, route.required_scopes, route.allowed_request_headers,
          route.allowed_response_headers, route.supports_sse, route.enabled, route.source],
      );
    }
    return routes.length;
  });
}
