path "secret/data/gateway/credentials/*" {
  capabilities = ["create", "read", "update"]
}

path "secret/metadata/gateway/credentials/*" {
  capabilities = ["delete"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}
