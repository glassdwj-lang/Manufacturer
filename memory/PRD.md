# Somnio.Co Atelier — Product Requirements

## Overview
A luxury React Native (Expo) mobile app that tracks every Somnio.Co jewelry piece through a proprietary 26-step "Digital DNA" manufacturing journey. Replaces email/spreadsheet status updates with an auditable, role-filtered, China-time-stamped workflow.

## Roles
- **Atelier (Admin)** — full access. Creates users, commissions, manages confidential customs/airway-bill docs.
- **Workshop (Manufacturer)** — sees only orders assigned to *their* workshop. Marks steps complete with photos + notes; all timestamps in Asia/Shanghai (CST).
- **Associate** — manages a set of clients; reviews step updates and forwards them (manually or via per-client AUTO-FWD toggle).
- **Maison (Client)** — read-only progress timeline. Only sees steps after the associate forwards them.

## 26-Step Journey (5 phases)
- **I · Origins & Design** (1–5)
- **II · The Master Craft** (6–15)
- **III · The Finishing Touch** (16–20)
- **IV · Quality Control Vault** (21–23)
- **V · Logistics & Ownership** (24–26)

## Tech
- **Backend** FastAPI + MongoDB. JWT (PyJWT) + bcrypt. All routes prefixed `/api`. China time via `pytz` Asia/Shanghai.
- **Frontend** Expo Router (file-based) with route groups `(app)/`. Dark luxury theme (`#0A0A0A` + `#D4AF37` gold). `react-native-safe-area-context`, `expo-image-picker` (base64), `@/src/utils/storage` for JWT persistence.

## Demo Accounts (seeded via POST /api/seed)
| Role | Email | Password |
|---|---|---|
| Admin | admin@somnio.co | Admin@2026 |
| Manufacturer | mfg@somnio.co | Mfg@2026 |
| Associate | associate@somnio.co | Assoc@2026 |
| Client | client@somnio.co | Client@2026 |

Sample order `SMN-DEMO0001` is created with the first 3 steps pre-completed and forwarded.

## Key Backend Endpoints
- `POST /api/seed` — idempotent demo seed
- `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`
- `GET/POST /api/orders` — role-filtered; create requires admin/associate
- `GET /api/orders/{id}` — full detail (client view auto-masks un-forwarded steps)
- `POST /api/orders/{id}/steps/{n}/complete` — manufacturer/admin; notes + base64 photos; auto-forwards if client.auto_forward = true
- `POST /api/orders/{id}/steps/{n}/forward` — associate/admin manual forward
- `PUT /api/orders/{id}/customs` — admin only (airway bill + customs doc + notes, all base64 / confidential)
- `GET /api/users`, `POST /api/users`, `PUT /api/users/{id}/auto-forward`, `DELETE /api/users/{id}` — admin user management

## Next Action Items
- Per-step sequential gating (currently any step can be marked complete out of order — by design for flexibility, can be toggled on per request)
- Cloudinary integration for file storage (currently base64 in MongoDB)
- Email/SMS notifications when associate has a pending forward
- Client-facing "Digital DNA" PDF export at step 26

## Latest Session (Sept 2026 — iter 16)
- **Market Anchor confidence filter** — MarketAnchorSection hides < 0.55 confidence
  matches by default; toggle chip surfaces raw scraper output when needed.
- **Quote PDF export + Duplicate** — `POST /api/quotes/{id}/duplicate`,
  `GET /api/quotes/{id}/pdf` (reportlab). New action row in QuoteDetailScreen
  under status pills: Export PDF · Duplicate · Delete.
- **Cloudflare-friendly Playwright** — real Chrome UA, en-AU locale, webdriver
  spoof + longer CF-challenge wait. Austen & Blake and Diamonds Factory flipped
  active=True in the competitor library.
- **Step photo email forwarding** — `POST /api/orders/{id}/steps/{n}/photos/email`
  reusing shared EmailFilesModal + i18n. Admin / associate see an "EMAIL" pill
  next to PHOTOS · APPROVED on completed steps.

