const CREDENTIAL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function parseCredentialId(args) {
  if (args.length !== 1 || !CREDENTIAL_ID_PATTERN.test(args[0])) {
    throw new Error("Provide exactly one credential UUID from the recovery log");
  }
  return args[0];
}

export function parseVaultAddress(address) {
  let url;
  try {
    url = new URL(address);
  } catch {
    throw new Error("VAULT_ADDR must be a loopback URL without path or credentials");
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname.toLowerCase()) ||
    !["http:", "https:"].includes(url.protocol) || url.pathname !== "/" ||
    url.username || url.password || url.search || url.hash) {
    throw new Error("VAULT_ADDR must be a loopback URL without path or credentials");
  }
  return url;
}
