import { parseCredentialId, parseVaultAddress } from "./vault-recovery.mjs";

const credentialId = parseCredentialId(process.argv.slice(2));
const address = process.env.VAULT_ADDR;
const token = process.env.VAULT_TOKEN;
if (!address || !token) throw new Error("VAULT_ADDR and VAULT_TOKEN are required");
const vaultUrl = parseVaultAddress(address);
const secretPath = `gateway/credentials/${credentialId}`;
const response = await fetch(new URL(`/v1/secret/metadata/${secretPath}`, vaultUrl), {
  method: "DELETE",
  headers: { "X-Vault-Token": token },
  redirect: "error",
  signal: AbortSignal.timeout(5_000),
});
if (!response.ok && response.status !== 404) {
  throw new Error("Vault cleanup failed; check Vault status and policy");
}
console.log(`Recovered Vault cleanup for credential ${credentialId}`);
