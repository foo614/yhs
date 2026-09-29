---
name: ysheng-backoffice
description: Work on the YS Heng back-office operations portal. Use for Vite React screens, Ant Design or Pro Components UI, API client contracts, cookie login, vehicles, repairs, loans, deliveries, payments, leads, audit logs, documents, uploads, dashboard, admin roles, and Vitest checks.
---

# YS Heng Back Office

## Key files

- Package: `apps/backoffice/package.json`
- Vite config: `apps/backoffice/vite.config.ts`
- App entry: `apps/backoffice/src/main.tsx`
- Main portal: `apps/backoffice/src/App.tsx`
- API client and types: `apps/backoffice/src/api.ts`
- API tests: `apps/backoffice/src/api.test.ts`
- Styles: `apps/backoffice/src/styles.css`

## API contract

- Use `VITE_API_BASE_URL`; default to `http://localhost:5000`.
- Send authenticated requests with `credentials: "include"`.
- Login through `POST /api/auth/login?useCookies=true`.
- Logout through `POST /api/auth/logout`.
- Load current user through `GET /api/auth/me`.
- Back-office endpoints are under `/api/*` and require the API `BackOffice` policy.
- Payment and finance endpoints require the API `Finance` policy.
- Keep TypeScript unions aligned with backend enums in `Domain/Models.cs`.
- Preserve useful fallback data for demo/local API outage behavior, but do not let fallback paths hide mutation errors.

## UI rules

- Optimize for staff completing operational tasks: clear next actions, readable forms, useful filters, and visible status.
- Design mobile first, then use the available tablet and desktop space for efficient scanning and comparison.
- Use Ant Design and Pro Components patterns already present in the app.
- Keep create/update flows tied to the API client in `src/api.ts`.
- Surface backend validation messages, especially duplicate invoice, wrong-plate, upload limit, and role-policy errors.
- Keep uploaded document categories aligned with backend `FileCategory` values.
- Treat finance screens, payment mutations, staff role updates, and admin flows as permission-sensitive.

## Choose an Ant Design component

1. Inspect the existing shared component and nearby screen first. Reuse its interaction and API contract when it fits.
2. Check `apps/backoffice/package.json` and the lockfile for the installed `antd` and Pro Components versions. At this update they are 5.22.6 and 2.8.6; the files remain the source of truth.
3. Use the [Ant Design agent guide](https://ant.design/docs/react/for-agents/) to find targeted documentation. For this v5 app, start with the [v5 component documentation](https://5x.ant.design/components/overview/), checking version-added notes and local types before copying props. Current main-site examples may require v6.
4. Read only the relevant component API, demo, or token reference. If the Ant Design CLI/MCP is already available, use a version-appropriate targeted query. Do not load `llms-full.txt`, install tooling, or upgrade production packages just to answer a component question.

| User task | Starting component or pattern |
| --- | --- |
| Enter or edit a record | Existing `Form` / Pro Form pattern with visible labels and field validation |
| Choose an existing vehicle, customer, or supplier | Searchable `Select`; for `{ value, label }` options use `showSearch` and `optionFilterProp="label"` |
| Enter free text with suggestions | `AutoComplete` when values outside the options are allowed |
| Enter a date or time | `DatePicker` / `TimePicker`; preserve the API date/time format |
| Enter an amount | Existing RM amount control or `InputNumber` pattern; preserve precision and validation |
| Read record details | `Descriptions` or the existing detail panel |
| Edit while retaining list context | `Drawer`, sized for the viewport; use a full page when the flow needs more space |
| Confirm a consequential action | Existing `Modal` confirmation pattern with a specific action label |
| Compare records | `Table` / `ProTable` on wide screens with the shared mobile record presentation |
| Show related sections or actual workflow stages | `Tabs` for sections; `Steps` only for a real staged flow |
| Arrange controls and communicate status | Existing layout tokens with `Space`, `Flex`, or `Row` / `Col`; `Tag` for status and `Alert` for actionable persistent feedback |

These are starting points, not a requirement to add more components. Choose the simplest interaction that lets staff complete the task.

## Mobile-first layout and usability

- Start with narrow-phone layouts: stacked record cards, single-column forms, wrapped filters, and reachable primary actions. Keep horizontal scrolling inside a table only when comparison cannot be simplified safely; avoid page-level overflow.
- Adapt tablet layouts with compact grids, wrapped actions, and appropriately sized drawers. Use desktop/laptop space for scannable tables, summaries, and side-by-side fields without stretching a mobile column across the page.
- Preserve necessary information, permitted actions, validation, and save behavior across sizes. Reflow content rather than hiding essential fields to make it fit.
- Keep key actions visible and easy to reach. Avoid hiding important workflow steps behind unclear menus.
- Keep forms easy to understand with clear labels, sensible defaults, validation messages, and obvious save or submit actions.
- Keep tables easy to scan with pagination, useful filters, status tags, short column labels, and the most important row action first.
- In back-office tables, keep row actions in a single right-fixed `Action / 操作` or `Next Action / 操作` column. Do not add separate left-side `Open` or `Details` action columns.
- Align row action buttons with the shared `tableActionGroup` pattern: `Details` first when a details view exists, then quick workflow actions.
- On mobile, reuse the shared record-card action styles: content-width, right-aligned actions at least 44px tall, with status metadata separate. Keep form submit actions visible and unobstructed by drawer footers.
- Reuse the app's spacing scale and Ant Design tokens for page gutters, section gaps, field spacing, and action groups. Keep related controls together, separate distinct tasks, and avoid arbitrary one-off margins or compressed labels.
- Use clear hierarchy and minimal decoration. A compact desktop layout must still give mobile controls room to read and tap.
- Avoid nested cards, oversized hero layouts, decorative backgrounds, and heavy visual effects in the operations portal.
- Make the UI usable for all staff: readable text, sufficient contrast, keyboard focus, touch-friendly controls, and no text overflow on small screens.
- Use bilingual labels where they improve staff understanding, especially for visible workflow headings, statuses, and operational terms.

## Verification

- Follow `codex-agent.md` for critical-only new test cases. Select existing tests for the affected behavior; use the full unit suite for broad changes or required CI, not automatically for each presentation edit.
- For visual changes, inspect the affected route at phone, tablet, and desktop sizes. Include populated records, long bilingual labels, multiple/disabled actions, terminal states, and relevant loading, empty, validation, and error states. Empty lists alone are insufficient.
- Reuse [responsive acceptance guidance](../../../docs/IMPLEMENTATION.md#back-office-responsive-acceptance) and `apps/backoffice/scripts/responsive-check.mjs`. Its existing width set includes phones, breakpoint boundaries, tablet, and desktop. Scope local runs with `RESPONSIVE_ROUTES` and, when appropriate, `RESPONSIVE_WIDTHS`; retain relevant breakpoint coverage and full CI checks.
- Keep fixtures synthetic, local, and mutation-free. Geometry checks supplement visual inspection; they do not prove every role, upload flow, or browser works. Report unavailable runtime/browser proof explicitly.

Available checks from the workspace root; choose those appropriate to the change:

```powershell
npm --workspace apps/backoffice run test
npm --workspace apps/backoffice run build
npm --workspace apps/backoffice run test:responsive
```

When changing shared workspace setup, also run:

```powershell
npm run build
npm run lint
```

For visual changes, start and inspect the app:

```powershell
npm run dev:backoffice
```

Local URL:

```text
http://localhost:3001
```
