#!/bin/sh
set -eu
VAULT_RENEW_ADDR=http://127.0.0.1:43872
VAULT_RENEW_TOKEN="$(jq -r '.auth.client_token' /root/api-gateway-vault-app-token.json)"
VAULT_ADDR="$VAULT_RENEW_ADDR" VAULT_TOKEN="$VAULT_RENEW_TOKEN" vault token renew -format=json >/dev/null
