import { NextResponse } from "next/server";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Federated API Gateway",
      version: "0.1.0",
      description: "Proxy transparente que valida JWT RS256 emitidos por aplicaciones registradas.",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        externalJwt: { type: "http", scheme: "bearer", bearerFormat: "JWT (RS256)" },
      },
      schemas: {
        GatewayError: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message", "requestId"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                requestId: { type: "string", format: "uuid" },
              },
            },
          },
        },
      },
    },
    paths: {
      "/api/v1/providers": {
        get: {
          operationId: "listAvailableProviders",
          security: [{ externalJwt: [] }],
          responses: { "200": { description: "Available providers and operations" } },
        },
      },
      "/api/v1/gateway/{provider}/{path}": {
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } },
          { name: "path", in: "path", required: true, schema: { type: "string" } },
        ],
        get: {
          operationId: "proxyGet",
          security: [{ externalJwt: [] }],
          responses: { "200": { description: "Unwrapped upstream response" } },
        },
        post: {
          operationId: "proxyPost",
          security: [{ externalJwt: [] }],
          responses: { "200": { description: "Unwrapped upstream response" } },
        },
      },
    },
  });
}
