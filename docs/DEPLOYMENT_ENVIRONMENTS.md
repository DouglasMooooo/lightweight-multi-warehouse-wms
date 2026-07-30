# Deployment Environments

Vercel Production and Preview must use separate PostgreSQL databases.

| Deployment | APP_ENV | DATABASE_ENV | Database |
| --- | --- | --- | --- |
| Local | development | development | local development |
| Vercel Preview | preview | preview or staging | non-production |
| Staging | staging | staging | non-production |
| Vercel Production | production | production | production |

`getPrisma()` validates the pairing before connection. Preview/staging/development with `DATABASE_ENV=production` is rejected. Vercel Preview, staging and production require `DATABASE_ENV`; Production also requires it to equal `production`.

`NEXT_PUBLIC_APP_ENV` drives the visible PREVIEW/STAGING banner and is populated from `VERCEL_ENV` by Next configuration when not explicitly supplied.

Production UI never renders Demo Reset or SHADOW_SEED. Server-side guards remain authoritative. Shadow Seed additionally requires a non-production app, `SHADOW_IMPORT_ENABLED=true`, an empty shadow inventory and a clean import. Admin tooling exposure requires both `NEXT_PUBLIC_SHADOW_IMPORT_ENABLED=true` and `NEXT_PUBLIC_ENABLE_ADMIN_TOOLS=true`.

Never copy production `DATABASE_URL` into a Preview environment. The metadata guard is defense-in-depth; separate Vercel environment-variable scopes and separate database credentials remain required.

Vercel runs `prisma generate`, `prisma migrate deploy`, and `next build`. Normal deployment never runs a seed or reset command.

`pnpm db:bootstrap-preview` remains an explicit manual tool for a completely empty, approved non-production database. It requires non-production environment metadata and `DEMO_MODE=true`, and it refuses to run when checked WMS tables contain data. It is not part of `vercel-build`.

With Neon, Prisma migrations prefer `DATABASE_URL_UNPOOLED` to avoid advisory-lock problems through the connection pool. Application queries continue to use the pooled `DATABASE_URL`.
