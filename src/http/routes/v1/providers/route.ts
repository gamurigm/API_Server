import { gatewayErrorResponse } from "@/lib/errors";
import { corsHeadersForRequest, handleCorsPreflight } from "@/lib/cors";
import { authenticateExternalRequest } from "@/lib/jwt";
import { listAccessibleProviders } from "@/lib/db/consumer";


export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  let corsHeaders: Record<string, string> = {};
  try {
    corsHeaders = await corsHeadersForRequest(request);
    const principal = await authenticateExternalRequest(request);
    corsHeaders = await corsHeadersForRequest(request, principal.applicationId);
    const { providers, routes } = await listAccessibleProviders(principal.applicationId);
    if (providers.length === 0) {
      return Response.json(
        { data: [] },
        { headers: { ...corsHeaders, "Cache-Control": "no-store", "X-Gateway-Request-Id": requestId } },
      );
    }
    return Response.json(
      {
        data: providers.map((provider) => ({
          ...provider,
          routes: routes.filter((route) => route.provider_id === provider.id),
        })),
      },
      { headers: { ...corsHeaders, "Cache-Control": "no-store", "X-Gateway-Request-Id": requestId } },
    );
  } catch (error) {
    return gatewayErrorResponse(error, requestId, corsHeaders);
  }
}

export const OPTIONS = handleCorsPreflight;
