import { afterEach, describe, expect, it } from "vitest";

import { isPrivateOrReservedIp, validateProviderBaseUrlSyntax } from "@/lib/network-security";

describe("network destination validation", () => {
  afterEach(() => {
    delete process.env.GATEWAY_ALLOW_LOCAL_TEST_HOSTS;
  });

  it.each(["127.0.0.1", "10.0.0.5", "172.16.4.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "2001:db8::1"])(
    "blocks private or reserved address %s",
    (address) => expect(isPrivateOrReservedIp(address)).toBe(true),
  );

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public address %s",
    (address) => expect(isPrivateOrReservedIp(address)).toBe(false),
  );

  it("requires a public HTTPS hostname on the standard port", () => {
    expect(validateProviderBaseUrlSyntax("https://api.example.com/v1").hostname).toBe("api.example.com");
    expect(() => validateProviderBaseUrlSyntax("http://api.example.com")).toThrowError(/HTTPS/u);
    expect(() => validateProviderBaseUrlSyntax("https://localhost/v1")).toThrowError(/not public/u);
    expect(() => validateProviderBaseUrlSyntax("https://api.example.com:8443/v1")).toThrowError(/standard HTTPS port/u);
  });

  it("allows loopback HTTP only behind the non-production test flag", () => {
    process.env.GATEWAY_ALLOW_LOCAL_TEST_HOSTS = "true";
    expect(validateProviderBaseUrlSyntax("http://127.0.0.1:4010/provider").port).toBe("4010");
  });
});
