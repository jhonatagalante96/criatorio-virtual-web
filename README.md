# Criatório Virtual Web

Frontend application for the Criatório Virtual SaaS.

## Planned stack

- Next.js / React
- Responsive, mobile-first interface
- Consumption of the Criatório Virtual API

## Run locally

Requires Node.js 20.9 or later and npm.

```bash
npm ci
npm run dev
```

Before starting the application, create `.env.local` from the example and set
the local API URL when it differs from the default:

```bash
Copy-Item .env.example .env.local
npm run dev
```

`NEXT_PUBLIC_API_URL` defaults to `https://localhost:58016` in the example. It
is public browser configuration only; do not add credentials or secrets to
this variable or commit `.env.local`.

Start the frontend after the local API is available at that address. To point
the frontend to another local API port, change only `NEXT_PUBLIC_API_URL` in
`.env.local`.

Open [https://localhost:3000](https://localhost:3000). To generate the production build, run:

```bash
npm run build
```
