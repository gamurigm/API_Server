import { handleGatewayRequest } from "@/lib/gateway-handler";
import { handleCorsPreflight } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ provider: string; path: string[] }>;
}

async function handler(request: Request, context: RouteContext) {
  return handleGatewayRequest(request, await context.params);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handleCorsPreflight;
