# XekuChat

Enterprise internal messaging system, feature-parity with LINE, designed to support up to 20,000 users.

## Features

- **Real-time messaging** — WebSocket + Redis Pub/Sub for cross-node broadcasting
- **Channels & DMs** — Group channels and 1-on-1 direct messages
- **Rich messages** — Markdown rendering, image/video/file uploads (up to 100MB), URL previews, emoji reactions, message replies
- **Image viewer** — Thumbnail display with click-to-expand Lightbox
- **Read receipts** — Read count per message (watermark model to avoid data bloat)
- **Message retraction** — Retracted messages show "This message has been recalled"
- **Full-text search** — pgroonga with CJK tokenization support
- **Auth** — Local email/password login + OIDC / OAuth 2.0 (Keycloak, Google, GitHub, Azure AD, etc.); OIDC can be toggled via `OIDC_ENABLED`
- **i18n** — Traditional Chinese / English (Vietnamese placeholder)
- **RWD** — Desktop / tablet / mobile, resizable sidebar
- **PWA** — Installable to desktop or mobile home screen; app shell cached for no-white-screen cold start
- **AI chat assistant** — OpenAI / Anthropic dual-provider, DM auto-trigger, group @mention, streaming responses, admin management
- **Integration API** — LINE Messaging API style REST endpoints (push / broadcast / reply), API key auth with rate limiting, webhook delivery with HMAC signing and retry
- **Audit log** — All admin actions are recorded

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Backend | Hono v4 + Prisma ORM |
| Frontend | React 19 + Tailwind CSS v4 |
| Database | PostgreSQL + pgroonga |
| Cache / Pub/Sub | Redis |
| Auth | OIDC + JWT (jose) |
| File Storage | MinIO (S3-compatible) |
| File Upload | tus resumable upload + multipart |
| Container | Docker + docker-compose |
| Reverse Proxy | Caddy (auto HTTPS, sticky session) |

## Quick Start (Development)

### Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose
- [Bun](https://bun.sh/) >= 1.0

### Steps

```bash
# 1. Clone the repo
git clone <repo-url>
cd xekuchat

# 2. Copy environment variables
cp .env.example .env
# Edit .env as needed (set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD at minimum)

# 3. Start infrastructure services
docker compose up -d

# 4. Install dependencies
bun install

# 5. Initialize the database
bun run db:push

# 6. Start dev server
bun run dev
```

Open http://localhost:5173 and sign in with the email/password set in `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`. Additional local accounts can be created in the Admin Panel (`/admin` → Local Accounts).

> **Note:** Set `OIDC_ENABLED=false` in `.env` to hide the SSO login button when Keycloak is not running.

## Project Structure

```
xekuchat/
├── packages/
│   ├── core/          # Shared types and constants
│   ├── server/        # Bun + Hono backend
│   │   ├── prisma/    # Schema & migrations
│   │   └── src/
│   │       ├── auth/  # OIDC, JWT, middleware
│   │       ├── routes/# REST API + Integration v1 API
│   │       ├── ws/    # WebSocket handler & Pub/Sub
│   │       ├── ai/    # AI assistant trigger, LLM client, context builder
│   │       ├── integration/ # API key, auth middleware, webhook delivery
│   │       └── lib/   # Prisma, Redis, MinIO, crypto
│   ├── client/        # React 19 frontend
│   │   └── src/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── pages/
│   │       └── i18n/
│   └── e2e/           # Playwright tests
├── docker/
│   └── postgres/init.sql
├── docker-compose.yml
├── docker-compose.prod.yml
├── Caddyfile
└── Dockerfile
```

## Common Commands

```bash
bun run dev              # Start server + client concurrently
bun run dev:server       # Start server only
bun run dev:client       # Start client only
bun run db:push          # Push schema to database
bun run db:generate      # Regenerate Prisma client
bun run test:e2e         # Run Playwright tests
bun run typecheck        # TypeScript type check
cd packages/client && bun run gen:icons   # Regenerate PWA icon PNGs from logo.svg
```

## Production Deployment

```bash
# Single node
docker compose -f docker-compose.prod.yml up -d

# Multi-node (horizontal scaling)
docker compose -f docker-compose.prod.yml up -d --scale app=3
```

See [PLAN.md](./PLAN.md) for detailed deployment notes.

## Environment Variables

See [.env.example](./.env.example).

## Development Progress

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Infrastructure, OIDC login, organization management | ✅ Done |
| Phase 2 | WebSocket real-time messaging, read receipts, retraction | ✅ Done |
| Phase 3 | File uploads, search, reactions, Markdown, URL preview | ✅ Done |
| Phase 4 | Admin panel, advanced permission management | ✅ Done |
| Phase 5 | PWA — installable to home screen, offline app shell | ✅ Done |
| Phase 6 | AI chat assistant — OpenAI/Anthropic streaming, DM, admin panel | ✅ Done |
| Phase 7 | AI Skills + MCP integration + monitoring | 📋 Planned |
| Phase 8 | Integration API — REST endpoints, webhook delivery, admin UI | ✅ Done |
| Phase 9 | Operational hardening — WebRTC, backup, monitoring | 📋 Planned |

## License

MIT
