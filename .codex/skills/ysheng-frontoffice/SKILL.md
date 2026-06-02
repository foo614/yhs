---
name: ysheng-frontoffice
description: Work on the YS Heng public front-office app. Use for Next.js App Router pages, public vehicle listings, vehicle detail pages, lead capture, public API calls, vehicle photos, styling, public data safety, and front-office build behavior.
---

# YS Heng Front Office

## Key files

- Package: `apps/frontoffice/package.json`
- Next config: `apps/frontoffice/next.config.mjs`
- App shell: `apps/frontoffice/app/layout.tsx`
- Home/listing page: `apps/frontoffice/app/page.tsx`
- Vehicle detail page: `apps/frontoffice/app/vehicles/[id]/page.tsx`
- Lead form: `apps/frontoffice/app/vehicles/[id]/LeadForm.tsx`
- Vehicle photo component: `apps/frontoffice/app/vehicles/VehiclePhoto.tsx`
- Public API service: `apps/frontoffice/app/vehicles/service.ts`
- Styles: `apps/frontoffice/app/styles.css`

## API contract

- Use `NEXT_PUBLIC_API_BASE_URL`; default to `http://localhost:5000`.
- Fetch public inventory from `GET /api/public/vehicles`.
- Fetch public vehicle details from `GET /api/public/vehicles/{id}`.
- Fetch public vehicle photos from `/api/public/vehicles/{id}/photo`.
- Submit leads to `POST /api/public/leads`.
- Public vehicle data should align with backend public DTOs and enum names.
- Keep graceful fallbacks for local/demo use when the API is unavailable.

## UI and data safety rules

- This is a public vehicle sales experience.
- Prioritize clear vehicle details, price, photo availability, and lead capture.
- Do not expose purchase price, refurbishment, commission, internal status details, audit data, finance-only data, or back-office workflow details.
- Handle missing photos cleanly using the existing photo fallback pattern.
- Keep copy practical and sales-focused.

## Verification

Run from the workspace root when front-office validation is requested:

```powershell
npm --workspace apps/frontoffice run build
```

When changing shared TypeScript or frontend workspace setup, also run:

```powershell
npm run build
npm run lint
```

For visual changes, start and inspect the app:

```powershell
npm run dev:frontoffice
```

Local URL:

```text
http://localhost:3000
```
