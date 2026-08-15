import {
  decodeJwt,
  decodeProtectedHeader,
  errors as joseErrors,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";

import { GatewayError } from "@/lib/errors";
import type { IdentityProvider } from "@/types/gateway";

export interface UnverifiedTokenIdentity {
  issuer: string;
  subject: string;
  audiences: string[];
}

export function tokenAudiences(audience: unknown): string[] {
  if (typeof audience === "string") return [audience];
  if (Array.isArray(audience)) {
    return audience.filter((value): value is string => typeof value === "string");
  }
  return [];
}

export function inspectRs256Token(token: string): UnverifiedTokenIdentity {
  let claims: JWTPayload;
  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    claims = decodeJwt(token);
    header = decodeProtectedHeader(token);
  } catch {
    throw new GatewayError(401, "invalid_token", "The JWT is malformed");
  }

  if (header.alg !== "RS256") {
    throw new GatewayError(401, "invalid_token_algorithm", "Only RS256 tokens are accepted");
  }
  if (typeof header.kid !== "string" || !header.kid) {
    throw new GatewayError(401, "missing_token_kid", "The JWT must contain a key identifier");
  }
  if (header.jku || header.jwk || header.x5u) {
    throw new GatewayError(401, "untrusted_token_key", "Embedded or token-provided key locations are not accepted");
  }

  const audiences = tokenAudiences(claims.aud);
  if (
    typeof claims.iss !== "string" ||
    !claims.iss ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    audiences.length === 0
  ) {
    throw new GatewayError(401, "invalid_token_claims", "The JWT must contain iss, sub and aud claims");
  }
  return { issuer: claims.iss, subject: claims.sub, audiences };
}

export async function verifyRs256Token(
  token: string,
  provider: Pick<IdentityProvider, "issuer" | "audiences">,
  keyResolver: JWTVerifyGetKey,
): Promise<JWTPayload> {
  try {
    const verified = await jwtVerify(token, keyResolver, {
      algorithms: ["RS256"],
      issuer: provider.issuer,
      audience: provider.audiences,
      clockTolerance: 60,
      requiredClaims: ["iss", "sub", "aud", "exp", "iat"],
    });
    return verified.payload;
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      throw new GatewayError(401, "token_expired", "The access token has expired");
    }
    if (error instanceof joseErrors.JOSEError) {
      throw new GatewayError(401, "invalid_token", "The JWT signature or claims are invalid");
    }
    throw error;
  }
}
