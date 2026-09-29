import { describe, expect, it } from "vitest";

import { parseCredentialId, parseVaultAddress } from "./vault-recovery.mjs";

describe("manual Vault credential recovery", () => {
  it("accepts one canonical credential UUID", () => {
    expect(parseCredentialId(["b57b7e8e-2192-4c43-9344-c9890c552741"])).toBe(
      "b57b7e8e-2192-4c43-9344-c9890c552741",
    );
  });

  it("rejects malformed IDs and extra arguments", () => {
    expect(() => parseCredentialId([])).toThrow(/one credential UUID/u);
    expect(() => parseCredentialId(["../../secret"])).toThrow(/one credential UUID/u);
    expect(() => parseCredentialId(["b57b7e8e-2192-4c43-9344-c9890c552741", "extra"])).toThrow(/one credential UUID/u);
  });

  it("allows only an HTTP(S) loopback Vault URL without extra URL components", () => {
    expect(parseVaultAddress("http://127.0.0.1:43872/").origin).toBe("http://127.0.0.1:43872");
    expect(() => parseVaultAddress("https://vault.example/")).toThrow(/loopback/u);
    expect(() => parseVaultAddress("http://localhost:43872/custom")).toThrow(/loopback/u);
  });
});
