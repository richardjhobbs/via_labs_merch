# VIA Merch

An agent for every merchandiser. The live product at [merch.getvia.xyz](https://merch.getvia.xyz) by VIA Labs.

- `web/` — Next.js app (workspace, VIA admin console, webhooks, jobs, MCP)
- `supabase/migrations/` — schema `merch` on the shared VIA Labs Supabase project

```bash
cd web && npm install && cp .env.example .env.local && npm run dev
```

See `CLAUDE.md` for the rules of the repo.
