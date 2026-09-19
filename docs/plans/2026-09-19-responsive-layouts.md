# Back-office mobile and tablet layouts

Tracking: [FOO-166](https://linear.app/foo-lim-dick/issue/FOO-166/stabilize-back-office-mobile-and-tablet-layouts).

## Scope and reproduced defects

This is a back-office presentation change. API contracts, record mutations, permissions, financial calculations, uploads and public pages are unchanged.

- A long vehicle model and workflow badge expanded a phone record card's implicit grid track. At 360px, its content and Publish to Website button reached x=410px while page overflow clipping concealed the defect.
- Tablet query forms allocated only one quarter of their container to each field/action group, squeezing inputs and clipping Expand. Shared query forms now select column spans by available responsive size.
- Select selectors were 40-44px tall while their roots reserved 32px, causing filters and adjacent content to overlap. Both reserve at least 44px on phone/tablet.
- Tablet form grids forced two 260px columns even inside narrow dialogs. Auto-fit now uses the form's available width; wide forms retain multiple columns.
- Finance's open range calendar increased the 360px document width to 601px. Phone range calendars now stack, with bounded scrolling; tablet/desktop retain side-by-side panels.
- Dashboard custom analytics controls now stack on phones. The copy layout no longer overrides Ant Space's layout.
- Delivery's long bilingual invoice-update action reached x=406px at 360px. Alert action containers can shrink, and dialog buttons can wrap with sufficient height.

Changes are in the existing rules and shared table component, rather than another appended set of page overrides. The 720px record-card breakpoint, 1024px navigation breakpoint and calendar's 768px interaction breakpoint have different purposes and are retained.

## Repeatable browser check

Install dependencies and the browser once, then run:

```powershell
npm ci
npm exec --workspace apps/backoffice -- playwright install chromium
npm --workspace apps/backoffice run test:responsive
```

The script starts its own loopback-only Vite server on port 4176 and stops it when finished. It requires no backend, login credentials or database. Every API request is intercepted with synthetic fixtures; mutations return a synthetic validation failure and never reach an API.

For an installed Edge browser on Windows:

```powershell
$env:RESPONSIVE_CHANNEL = 'msedge'
npm --workspace apps/backoffice run test:responsive
```

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `RESPONSIVE_BASE_URL` | Use an existing local server instead of starting one. Remote hosts are rejected. |
| `RESPONSIVE_WIDTHS` | Comma-separated widths; defaults to 360,390,720,721,767,768,820,1024,1025,1440. |
| `RESPONSIVE_HEIGHT` | Height in CSS pixels; defaults to 900. Use 390 with width 820 for a landscape check. |
| `RESPONSIVE_ROUTES` | Comma-separated module paths without a leading slash. Defaults to all 11 modules. |
| `RESPONSIVE_INTERACTIONS` | `1` checks interactions at every supplied width; `0` disables them. Default checks 360,820,1440. |
| `RESPONSIVE_TABS` | Same width selection for module tab checks. Tabs are activated through their keyboard interface. |
| `RESPONSIVE_OUTPUT` | Screenshot and JSON directory; defaults to ignored `artifacts/responsive` at repository root. |

The check covers page-level horizontal overflow, controls outside the viewport (even where page overflow is hidden), select-height overlap and uncaught browser errors. Unspecified GET fixtures, non-aborted failed requests and unexpected console errors fail the run. Intentional empty collections are explicitly listed. Two existing Ant Design warnings (empty disabled date values and unattached form instances) are retained in diagnostics but allowlisted; their underlying behavior is outside this styling change. Tables retain intentional internal horizontal scrolling. Representative widths also cover navigation, available create forms and details drawers, vehicle validation, empty search/reset/pagination, date range opening/selection and module tabs. Long synthetic labels exercise wrapping; empty datasets exercise empty states.

CI's Web apps job installs Chromium, runs the same command and uploads screenshots and results. No deployment job or production wiring changes.

## Acceptance and limitations

Review screenshots as well as numeric results: overflow assertions cannot detect every visual defect, overlap or obscured control. Future responsive changes should extend this existing scenario runner when a concrete recurring defect needs coverage.

Local browser checks use Edge/Chromium viewport emulation and synthetic BossAdmin data. They do not prove real API persistence, every record/status/role combination, physical touch gestures, native on-screen keyboard behavior or Safari rendering. Physical iPhone/iPad Safari and Android checks remain part of release acceptance, especially text entry, scrollable dialogs, tabs and date selection.

Implementation and local verification are separate from publication. These changes are not deployed merely because the local tests pass.

## Local verification on 2026-09-19

- Back-office Vitest: 468 tests across 44 files passed.
- Both frontend lint checks and the back-office production build passed. The build retains its existing large-chunk warning.
- Edge: 166 page/interaction states passed at 360, 820 and 1440px; 77 page checks passed across the other seven boundary widths. A further 17 landscape states passed at 820x390.
- Bundled Chromium: 27 vehicle, finance and delivery states passed at 360 and 820px using the final runner, including its unexpected-console-error gate.
- Final comprehensive fixtures produced no unknown API requests or non-aborted failed requests. Console errors contained only the two documented existing warnings.
- Representative before/after screenshots were inspected. Script syntax and Git whitespace checks passed; a separate reviewer checked the implementation and regression runner.

Changes are isolated on `codex/foo-166-responsive`. They remain uncommitted, unmerged and undeployed. GitHub CI has been configured but has not run for this change.
