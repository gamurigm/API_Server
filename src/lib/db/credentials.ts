import { randomUUID } from "node:crypto";

import { queryOne, queryRows } from "@/lib/db/consumer";
import { getDbPool, withDbTransaction } from "@/lib/db/pool";
import { GatewayError } from "@/lib/errors";
import { deleteGatewaySecret, writeGatewaySecret } from "@/lib/vault";
import type { CredentialMetadata } from "@/types/gateway";

export interface CredentialInput {
  provider_id: string;
  owner_type: "shared" | "application";
  consumer_application_id?: string | null;
  label: string;
  secret: string;
}

export function listCredentialMetadata(): Promise<Record<string, unknown>[]> {
  return queryRows(
    `SELECT c.id, c.provider_id, c.owner_type, c.consumer_application_id, c.label, c.enabled,
            c.created_at, c.updated_at,
            json_build_object('name', p.name, 'slug', p.slug) AS providers,
            CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('name', a.name, 'slug', a.slug) END AS consumer_applications
     FROM public.credentials c
     JOIN public.providers p ON p.id = c.provider_id
     LEFT JOIN public.consumer_applications a ON a.id = c.consumer_application_id
     WHERE c.retired_at IS NULL
     ORDER BY c.created_at DESC`,
  );
}

export function findActiveCredential(providerId: string, applicationId: string): Promise<CredentialMetadata | null> {
  return queryOne(
    `SELECT id, provider_id, owner_type, consumer_application_id, label, vault_path,
            enabled, created_at, updated_at
     FROM public.credentials
     WHERE provider_id = $1 AND enabled
       AND (owner_type = 'shared' OR (owner_type = 'application' AND consumer_application_id = $2))
     ORDER BY CASE WHEN owner_type = 'application' THEN 0 ELSE 1 END
     LIMIT 1`,
    [providerId, applicationId],
  );
}

export function setCredentialEnabled(id: string, enabled: boolean): Promise<{ id: string; enabled: boolean } | null> {
  return queryOne(
    `UPDATE public.credentials SET enabled = $2
     WHERE id = $1 AND retired_at IS NULL
     RETURNING id, enabled`,
    [id, enabled],
  );
}

export async function deleteCredential(id: string): Promise<boolean> {
  const credential = await withDbTransaction(async (client) => {
    const result = await client.query<{ vault_path: string; delete_requested_at: string | null }>(
      `SELECT vault_path, delete_requested_at
       FROM public.credentials WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const current = result.rows[0];
    if (!current) return null;

    if (!current.delete_requested_at) {
      await client.query(
        `UPDATE public.credentials
         SET enabled = false,
             retired_at = COALESCE(retired_at, now()),
             delete_requested_at = now()
         WHERE id = $1`,
        [id],
      );
    }
    return { vault_path: current.vault_path };
  });
  if (!credential) return false;

  // A Vault failure leaves the retired row for vault:cleanup to retry.
  try {
    await deleteGatewaySecret(credential.vault_path);
  } catch {
    throw new GatewayError(
      503,
      "credential_delete_pending",
      "The credential is inactive; Vault deletion is pending and can be retried with npm run vault:cleanup",
    );
  }
  await getDbPool().query(
    `DELETE FROM public.credentials
     WHERE id = $1 AND retired_at IS NOT NULL AND delete_requested_at IS NOT NULL`,
    [id],
  );
  return true;
}

export async function createCredential(input: CredentialInput): Promise<string> {
  if ((input.owner_type === "shared" && input.consumer_application_id) ||
    (input.owner_type === "application" && !input.consumer_application_id)) {
    throw new Error("Credential owner is inconsistent");
  }
  const id = randomUUID();
  const path = await writeGatewaySecret(id, input.secret);
  let retired: { id: string; vault_path: string }[];
  try {
    retired = await withDbTransaction(async (client) => {
      const previous = await client.query<{ id: string; vault_path: string }>(
        `UPDATE public.credentials SET enabled = false, retired_at = now()
         WHERE provider_id = $1 AND owner_type = $2
           AND consumer_application_id IS NOT DISTINCT FROM $3::uuid AND retired_at IS NULL
         RETURNING id, vault_path`,
        [input.provider_id, input.owner_type, input.consumer_application_id ?? null],
      );
      await client.query(
        `INSERT INTO public.credentials
         (id, provider_id, owner_type, consumer_application_id, label, vault_path)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, input.provider_id, input.owner_type, input.consumer_application_id ?? null, input.label, path],
      );
      return previous.rows;
    });
  } catch (error) {
    try {
      await deleteGatewaySecret(path);
    } catch {
      try {
        await getDbPool().query(
          `INSERT INTO public.vault_cleanup_queue (credential_id, vault_path)
           VALUES ($1, $2) ON CONFLICT (credential_id) DO NOTHING`,
          [id, path],
        );
        console.error("vault_compensation_queued", { credentialId: id });
      } catch {
        // The ID is sufficient to reconstruct the path with npm run vault:recover.
        console.error("vault_compensation_recovery_required", { credentialId: id });
      }
    }
    throw error;
  }
  for (const old of retired) {
    try {
      await deleteGatewaySecret(old.vault_path);
      await getDbPool().query("UPDATE public.credentials SET vault_deleted_at = now() WHERE id = $1 AND retired_at IS NOT NULL", [old.id]);
    } catch {
      console.error("vault_retired_cleanup_pending", { credentialId: old.id });
    }
  }
  return id;
}
