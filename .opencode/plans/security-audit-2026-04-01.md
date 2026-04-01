---
status: in-progress
phase: 1
updated: 2026-04-01
---

# Security & Architecture Hardening Plan

## Goal
Remediate critical security vulnerabilities, harden the deployment pipeline, and bring the project in line with security best practices.

## Context & Decisions
| Decision | Rationale | Source |
|----------|-----------|--------|
| Add server-side MIME+size validation to upload | Client-side accept="" is trivially bypassed; prevents shell upload & disk exhaustion | Manual code audit |
| Add security headers for CMS on port 3000 | CMS is directly exposed without X-Frame-Options, X-Content-Type-Options, CSP | Manual infrastructure audit |
| Move FRONTEND_URL to GitHub secrets | Dev/prod parity, prevents accidental webhook misrouting | Manual deploy.yml review |
| Add npm audit to CI pipeline | No vulnerability scanning currently; catch supply-chain CVEs before deploy | Manual CI review |
| Rate-limit /api/upload endpoint | Prevents DoS, S3 cost attacks, brute-force enumeration | Manual endpoint review |
| Whitelist webhook payload fields | Full doc object may leak internal/relationship data | Manual notifyFrontend.ts review |
| Return generic errors to clients | err.message can leak stack traces and file paths | Manual route.ts review |
| Sanitize S3 path category parameter | Prevents path traversal via user-controlled input | `ref:reviewer-feedback` |
| Restrict port 3000 to internal access | CMS bypasses nginx security headers when exposed directly | `ref:reviewer-feedback` |
| Add CORS for API routes | Prevent unauthorized cross-origin API access | `ref:reviewer-feedback` |

## Phase 1: Critical Security Fixes [IN PROGRESS]

- [ ] **1.1 Add file type + size validation to upload route** ← CURRENT
  - File: `src/app/(payload)/api/upload/route.ts`
  - Validate MIME type against allow-list: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
  - Cap file size at **10 MB** (10_485_760 bytes)
  - Reject invalid uploads with 400

- [ ] 1.2 Add security headers to CMS nginx config
  - File: `docs/droplet-setup.md` (nginx config section)
  - **Approach**: Create new nginx server block proxying port 3000 to localhost:3000
  - Headers: `X-Frame-Options SAMEORIGIN`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`
  - This means port 3000 goes through nginx (replace `ufw allow 3000/tcp` with internal-only access)

- [ ] 1.3 Move FRONTEND_URL to GitHub secrets in deploy.yml
  - File: `.github/workflows/deploy.yml` line 41 (build step) AND line 88 (Write .env step)
  - Change `FRONTEND_URL: http://localhost:3001` → `FRONTEND_URL: ${{ secrets.FRONTEND_URL }}`
  - The build step value is baked into the Next.js bundle; must be correct at build time

- [ ] 1.4 Add npm audit step to CI pipeline
  - File: `.github/workflows/deploy.yml`
  - Add `- run: npm audit --audit-level=high` after `npm ci`

## Phase 2: High Priority Hardening [PENDING]

- [ ] 2.1 Implement rate limiting on /api/upload
  - **Approach**: nginx `limit_req_zone` (preferred — no app-level changes)
  - **Config**: 10 requests/minute per IP, with 429 response on excess
  - **Bypass**: Skip rate limiting for Tailscale subnet (100.x.x.x) for admin use

- [ ] 2.2 Whitelist webhook payload fields in notifyFrontend.ts
  - File: `src/lib/notifyFrontend.ts`
  - Send only: `{ id, slug, updatedAt, deletedAt }` (minimal set for cache invalidation)
  - Pass collection and event as-is (already structured)

- [ ] 2.3 Return generic error messages to clients
  - File: `src/app/(payload)/api/upload/route.ts`
  - Log full error server-side with `[upload]` prefix
  - Return `{ error: 'Upload failed' }` to client (no stack traces)

- [ ] 2.4 Sanitize S3 path `category` parameter
  - File: `src/lib/s3-upload.ts`, function `generateDateBasedPath`
  - Strip path separators (`/`, `\`, `..`) from the `category` argument
  - Or: reject `category` that doesn't match `^[a-z0-9-]+$`

- [ ] 2.5 Add CORS configuration for API routes
  - Restrict `Access-Control-Allow-Origin` to known frontend domains
  - Use `NEXT_PUBLIC_SERVER_URL` and `FRONTEND_URL` as allowed origins

## Phase 3: Medium Priority Improvements [PENDING]

- [ ] 3.1 Add Content-Security-Policy header
  - **For CMS admin panel**: requires `script-src 'self' 'unsafe-inline'` (Lexical), `img-src 'self' https://*.digitaloceanspaces.com`, `connect-src 'self' https://*.digitaloceanspaces.com`
  - Evaluate nonce-based CSP via nginx or Next.js middleware
  - This is complex — needs testing against Payload admin UI

- [ ] 3.2 Review S3 credential rotation strategy
  - Consider IAM roles or periodic key rotation
  - Define: rotation frequency (quarterly), zero-downtime approach (dual-key overlap period)

- [ ] 3.3 Add webhook retry logic with exponential backoff
  - File: `src/lib/notifyFrontend.ts`
  - Config: 3 retries, exponential backoff starting at 1s, max delay 30s
  - Use `AbortController` for fetch timeout (5s per attempt)

- [ ] 3.4 Review eslint-disable in ImageGalleryField
  - File: `src/components/ImageGalleryField/index.tsx` line 173
  - Pattern `ids.join(',')` as deps is valid but fragile
  - Consider extracting to `useMemo` for clarity

- [ ] 3.5 Enforce TLS for MongoDB connection
  - File: `src/payload.config.ts`
  - Ensure `DATABASE_URL` includes `?tls=true` or `?ssl=true`
  - Document in `.env.example`

## Implementation Specifications

These values must be decided before execution begins:

| Specification | Value |
|---------------|-------|
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| Max upload size | 10 MB (10,485,760 bytes) |
| Rate limit | 10 req/min per IP on `/api/upload` |
| Webhook payload fields | `id`, `slug`, `updatedAt`, `deletedAt` |
| Category path regex | `^[a-z0-9-]+$` (lowercase alnum + hyphens) |
| MongoDB TLS | `tls=true` param in connection string |

## Notes
- 2026-04-01: Full codebase audit completed. All primary deps (payload 3.79.x, next 15.4.x, react 19.2.x) are current. No Dockerfile — deployment is rsync+PM2 via GitHub Actions.
- 2026-04-01: Deployment infrastructure is well-hardened (UFW, non-default SSH port, Tailscale, `chmod 600` on .env, secrets in GitHub Actions).
- 2026-04-01: Review feedback incorporated — added path traversal fix, CORS, MongoDB TLS, port 3000 exposure, build-time FRONTEND_URL, and explicit implementation specifications.
