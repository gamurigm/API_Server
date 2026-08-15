import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { inspectRs256Token, verifyRs256Token } from "@/lib/jwt-core";

let privateKey: CryptoKey;
let resolver: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey as CryptoKey;
  const publicJwk = await exportJWK(pair.publicKey);
  resolver = createLocalJWKSet({ keys: [{ ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }] });
});

async function token(overrides: { issuer?: string; audience?: string; algorithm?: "RS256" | "PS256" } = {}) {
  return new SignJWT({ scope: "quotes:read", roles: ["member"] })
    .setProtectedHeader({ alg: overrides.algorithm ?? "RS256", kid: "test-key" })
    .setIssuer(overrides.issuer ?? "https://issuer.example.com")
    .setSubject("user-123")
    .setAudience(overrides.audience ?? "desktop-app")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("RS256 JWT trust", () => {
  it("inspects only routing claims and verifies signature, issuer and audience", async () => {
    const signed = await token();
    expect(inspectRs256Token(signed)).toEqual({
      issuer: "https://issuer.example.com",
      subject: "user-123",
      audiences: ["desktop-app"],
    });
    const claims = await verifyRs256Token(
      signed,
      { issuer: "https://issuer.example.com", audiences: ["desktop-app"] },
      resolver,
    );
    expect(claims.sub).toBe("user-123");
  });

  it("rejects a wrong audience", async () => {
    const signed = await token();
    await expect(
      verifyRs256Token(signed, { issuer: "https://issuer.example.com", audiences: ["another-app"] }, resolver),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects a non-RS256 protected algorithm before key lookup", async () => {
    const pair = await generateKeyPair("PS256");
    const signed = await new SignJWT({})
      .setProtectedHeader({ alg: "PS256", kid: "test-key" })
      .setIssuer("https://issuer.example.com")
      .setSubject("user-123")
      .setAudience("desktop-app")
      .setExpirationTime("5m")
      .sign(pair.privateKey);
    expect(() => inspectRs256Token(signed)).toThrowError(/Only RS256/u);
  });

  it("rejects token-provided key locations", async () => {
    const signed = await new SignJWT({})
      .setProtectedHeader({
        alg: "RS256",
        kid: "test-key",
        jku: "https://attacker.example/jwks.json",
      })
      .setIssuer("https://issuer.example.com")
      .setSubject("user-123")
      .setAudience("desktop-app")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    expect(() => inspectRs256Token(signed)).toThrowError(/not accepted/u);
  });

  it("requires an issued-at claim", async () => {
    const signed = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://issuer.example.com")
      .setSubject("user-123")
      .setAudience("desktop-app")
      .setExpirationTime("5m")
      .sign(privateKey);
    await expect(
      verifyRs256Token(
        signed,
        { issuer: "https://issuer.example.com", audiences: ["desktop-app"] },
        resolver,
      ),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });
});
