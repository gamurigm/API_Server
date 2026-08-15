import "server-only";

import { getServerEnv } from "@/lib/env";
import { GatewayError, gatewayErrorResponse } from "@/lib/errors";
import {
  consumeRateLimit,
  acquireStreamLease,
  loadInvocationContext,
  resolveProviderSecret,
  releaseStreamLease,
  writeAudit,
  type InvocationContext,
} from "@/lib/gateway-store";
import { authenticateExternalRequest } from "@/lib/jwt";
import { assertPublicProviderUrl } from "@/lib/network-security";
import {
  buildUpstreamHeaders,
  buildUpstreamUrl,
  filterUpstreamResponseHeaders,
  findMatchingRoute,
  hasRequiredScopes,
  injectProviderCredential,
  normalizePathSegments,
} from "@/lib/proxy-utils";
import { readRequestBody, readResponseBody } from "@/lib/body-limits";
import { corsHeadersForRequest } from "@/lib/cors";
import type { ExternalPrincipal } from "@/types/gateway";

interface GatewayRouteParams {
  provider: string;
  path: string[];
}

function gatewayErrorCode(error: unknown): string {
  return error instanceof GatewayError ? error.code : "internal_error";
}

function durationSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function asArrayBuffer(value: Uint8Array | undefined): ArrayBuffer | undefined {
  return value ? Uint8Array.from(value).buffer : undefined;
}

function createAbortContext(request: Request, timeoutMs: number) {
  const controller = new AbortController();
  const abortFromClient = () => controller.abort(request.signal.reason ?? "client disconnected");
  request.signal.addEventListener("abort", abortFromClient, { once: true });
  const timeout = setTimeout(() => controller.abort("upstream timeout"), timeoutMs);

  return {
    signal: controller.signal,
    abort: () => controller.abort("gateway cancelled request"),
    cleanup: () => {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", abortFromClient);
    },
  };
}

function streamUpstreamBody(
  source: ReadableStream<Uint8Array>,
  abortContext: ReturnType<typeof createAbortContext>,
  onComplete: () => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let completed = false;
  const finalize = async () => {
    if (completed) return;
    completed = true;
    abortContext.cleanup();
    await onComplete();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await finalize();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        await finalize();
        controller.error(error);
      }
    },
    async cancel(reason) {
      abortContext.abort();
      try {
        await reader.cancel(reason);
      } finally {
        await finalize();
      }
    },
  });
}

export async function handleGatewayRequest(
  request: Request,
  params: GatewayRouteParams,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  const method = request.method.toUpperCase();
  let auditPath = "/";
  let principal: ExternalPrincipal | undefined;
  let context: InvocationContext | undefined;
  let corsHeaders: Record<string, string> = {};
  let streamLeaseId: string | undefined;

  try {
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      throw new GatewayError(405, "method_not_allowed", "The HTTP method is not supported");
    }

    // Validate a browser origin first so authentication errors remain readable
    // by registered web clients. After JWT verification, bind it to that app.
    corsHeaders = await corsHeadersForRequest(request);
    principal = await authenticateExternalRequest(request);
    corsHeaders = await corsHeadersForRequest(request, principal.applicationId);
    const pathSegments = normalizePathSegments(params.path ?? []);
    auditPath = `/${pathSegments.join("/")}`;
    context = await loadInvocationContext(
      principal,
      params.provider,
      method,
      auditPath,
      findMatchingRoute,
    );

    if (!hasRequiredScopes(principal.scopes, context.route.required_scopes)) {
      throw new GatewayError(403, "insufficient_scope", "The token lacks a required route scope");
    }

    const rateLimit = await consumeRateLimit(context, principal);
    const rateHeaders = {
      "X-RateLimit-Limit": String(context.effectiveRateLimit),
      "X-RateLimit-Remaining": String(rateLimit.remaining),
      "X-RateLimit-Reset": String(Math.floor(new Date(rateLimit.reset_at).getTime() / 1000)),
    };
    if (!rateLimit.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((new Date(rateLimit.reset_at).getTime() - Date.now()) / 1000),
      );
      throw new GatewayError(
        429,
        "rate_limited",
        `Rate limit exceeded; retry in ${retryAfter} seconds`,
        true,
        { ...rateHeaders, "Retry-After": String(retryAfter) },
      );
    }

    if (context.route.supports_sse) {
      streamLeaseId = await acquireStreamLease(context, principal);
    }

    const baseUrl = await assertPublicProviderUrl(context.provider.base_url);
    const incomingUrl = new URL(request.url);
    const upstreamUrl = buildUpstreamUrl(baseUrl, pathSegments, incomingUrl);
    const upstreamHeaders = buildUpstreamHeaders(request, context.route);
    const secret = await resolveProviderSecret(context);
    injectProviderCredential(context.provider, upstreamHeaders, upstreamUrl, secret);
    const body = await readRequestBody(request, getServerEnv().GATEWAY_JSON_LIMIT_BYTES);
    const abortContext = createAbortContext(
      request,
      context.route.supports_sse ? context.provider.sse_timeout_ms : context.provider.timeout_ms,
    );

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        method,
        headers: upstreamHeaders,
        body: asArrayBuffer(body),
        redirect: "manual",
        cache: "no-store",
        signal: abortContext.signal,
      });
    } catch {
      abortContext.cleanup();
      if (abortContext.signal.aborted) {
        throw new GatewayError(504, "upstream_timeout", "The upstream request timed out");
      }
      throw new GatewayError(502, "upstream_unavailable", "The upstream provider could not be reached", false);
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      abortContext.abort();
      abortContext.cleanup();
      throw new GatewayError(502, "upstream_redirect_blocked", "Upstream redirects are disabled");
    }

    const headers = filterUpstreamResponseHeaders(upstream.headers, context.route);
    headers.set("X-Gateway-Request-Id", requestId);
    for (const [name, value] of Object.entries(corsHeaders)) {
      headers.set(name, value);
    }
    for (const [name, value] of Object.entries(rateHeaders)) {
      headers.set(name, value);
    }

    const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
    const isSse = contentType.startsWith("text/event-stream");
    if (isSse) {
      if (!context.route.supports_sse || !upstream.body) {
        abortContext.abort();
        abortContext.cleanup();
        throw new GatewayError(502, "unexpected_stream", "This route is not configured for streaming");
      }

      await writeAudit({
        requestId,
        principal,
        providerId: context.provider.id,
        routeId: context.route.id,
        method,
        path: auditPath,
        outcome: "upstream",
        upstreamStatus: upstream.status,
        durationMs: durationSince(startedAt),
      });
      const activeLease = streamLeaseId;
      streamLeaseId = undefined;
      return new Response(streamUpstreamBody(upstream.body, abortContext, async () => {
        if (activeLease) await releaseStreamLease(activeLease);
      }), {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    }

    let responseBody: Uint8Array;
    try {
      responseBody = await readResponseBody(upstream, getServerEnv().GATEWAY_JSON_LIMIT_BYTES);
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      if (abortContext.signal.aborted) {
        throw new GatewayError(504, "upstream_timeout", "The upstream response timed out");
      }
      throw new GatewayError(502, "upstream_read_failed", "The upstream response could not be read", false);
    } finally {
      abortContext.cleanup();
    }
    if (streamLeaseId) {
      await releaseStreamLease(streamLeaseId);
      streamLeaseId = undefined;
    }
    await writeAudit({
      requestId,
      principal,
      providerId: context.provider.id,
      routeId: context.route.id,
      method,
      path: auditPath,
      outcome: "upstream",
      upstreamStatus: upstream.status,
      durationMs: durationSince(startedAt),
      responseBytes: responseBody.byteLength,
    });

    const responseBodyInit = [204, 205].includes(upstream.status)
      ? null
      : asArrayBuffer(responseBody);
    return new Response(responseBodyInit, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (error) {
    if (streamLeaseId) {
      await releaseStreamLease(streamLeaseId);
    }
    await writeAudit({
      requestId,
      principal,
      providerId: context?.provider.id,
      routeId: context?.route.id,
      method,
      path: auditPath,
      outcome: "gateway_error",
      gatewayErrorCode: gatewayErrorCode(error),
      durationMs: durationSince(startedAt),
    });
    return gatewayErrorResponse(error, requestId, corsHeaders);
  }
}
