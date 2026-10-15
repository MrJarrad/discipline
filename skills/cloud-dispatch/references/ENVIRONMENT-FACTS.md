# Environment facts (DISC-174, session 25)

- the network allowlist holds one secret per host, and a second secret for
  `api.cloudflare.com` is ignored; Cloudflare build logs need a user token the session does not carry; secrets
  load only at session start, so one added mid-session is not seen until a new session.
