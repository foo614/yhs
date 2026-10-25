# Admin login redesign QA

source visual truth path: `C:\Users\User\AppData\Local\Temp\codex-clipboard-4d3bb234-8b1b-4ac6-b83f-c7a094418049.png`
implementation screenshot path: `C:\Users\User\AppData\Local\Temp\ysheng-admin-login-minimal-desktop.png`
comparison input: `C:\Users\User\AppData\Local\Temp\ysheng-admin-login-minimal-comparison.png`
mobile screenshot path: `C:\Users\User\AppData\Local\Temp\ysheng-admin-login-minimal-mobile.png`

## Capture setup

- Desktop viewport: 2048 x 756 CSS pixels.
- Source pixels: 2048 x 756.
- Implementation pixels: 2048 x 756.
- Device pixel ratio: 1; no density normalization required.
- Responsive check: 1280 x 720 and 390 x 844.
- Desktop state: normal login state with seeded email visible and password empty.
- Source state: prefilled credentials with a visible failed-login alert. Password state was not reproduced in the implementation capture because browser QA did not transmit a password merely to manufacture an error state.

## Full-view comparison evidence

The combined comparison shows the final minimal implementation intentionally removes the two-region workspace composition and keeps only a centered YS Heng logo, portal title, and sign-in form. The page uses a light neutral canvas, restrained typography, and YS Heng teal for the primary action.

## Focused-region comparison evidence

- Brand/header: the supplied logo and `YS Heng Portal` title are centered above the form.
- Sign-in form: work-email and password fields plus the primary submit action remain compatible with the existing form behavior.
- Responsive card: at 390 x 844 the same centered card remains readable with no horizontal overflow.

## Findings

No actionable P0, P1, or P2 visual findings remain.

The minimal pass has no actionable P0, P1, or P2 visual findings. The desktop and mobile screenshots fit their viewports without overflow.

## Comparison history

1. Previous pass: the Apple-inspired workspace layout was visually clean but contained more content than requested.
2. Minimal pass: removed the hero, modules, badges, support copy, and security footer; centered only the logo, title, and login form.
3. Final evidence: 2048 x 756 body scroll size is 2048 x 756; 390 x 844 body scroll size is 390 x 844. Browser console error log was empty.

## Implementation checklist

- [x] Preserve cookie-login form behavior and existing auth API contract.
- [x] Preserve supplied logo and existing Ant Design icon library.
- [x] Improve desktop hierarchy and operational trust cues.
- [x] Keep the form responsive on mobile.
- [x] Check required-field validation without transmitting a password.
- [x] Run back-office tests, lint, build, and `git diff --check`.

## Follow-up polish

The captured source shows a failed-login state while the implementation capture shows the normal state. The exact error state was not reproduced in browser QA to avoid transmitting a password.

final result: passed

---

# Showroom enquiry desktop companion QA

## Capture setup

- Source visual truth: `C:\Users\User\.codex\generated_images\01a03954-fb8e-74c2-980f-ba61fab8dbe7\exec-ffa7d201-bf5f-4aa2-9ae2-da0b0de2daa9.png`.
- Implementation: `http://localhost:3003/showroom-enquiry`, captured in the Codex in-app browser. The browser emitted the screenshot directly to the visual comparison and does not expose a stable local screenshot path.
- Comparison input: the 1487 x 1058 source was normalized proportionally to the 1440 x 1024 browser capture (0.968 scale, device pixel ratio 1) and emitted with that final browser capture in the same visual comparison.
- State: first step, no vehicle selected. The vehicle-tile selection and Next transition were also exercised separately without submitting an enquiry.
- Responsive check: 393 x 852 CSS pixels. The preserved Canvas mobile composition had no horizontal overflow after the CTA width correction.

## Full-view comparison evidence

The desktop screen now uses a 1248 px showroom canvas instead of a narrow mobile column: a large left-aligned logo and heading sit over the pale showroom treatment, the hero continues across the full composition, the four vehicle types form one row, and the primary action remains compact and left-aligned. The duplicate progress dots embedded in the mobile hero asset are masked on desktop; the accessible desktop progress row remains visible above the copy.

## Focused-region comparison evidence

- Header and hierarchy: the logo, five-dot progress treatment, showroom label, two-line heading, and supporting copy retain the source's left-side hierarchy.
- Vehicle choices: Sedan, SUV, MPV, and Pickup render as four equal image cards; selecting Sedan sets `aria-pressed` and Next reaches the preferences step.
- Responsive layout: at 1440 px the shell is 1248 px wide with four 297 px tracks; at 393 px the mobile Canvas artwork remains the first-screen treatment and the CTA ends at x=369 within the viewport.

## Findings

No actionable P0, P1, or P2 differences remain for the approved desktop companion design.

- [P3] The browser-scaled source crop is slightly softer than the design image at the showroom logo and vehicle edges. This comes from the existing supplied Canvas raster assets; it does not affect hierarchy, crop, or interaction.

## Comparison history

1. Initial desktop pass: the 680 px mobile canvas was widened to a four-card desktop row, but its logo, title wrap, card scale, and vertical rhythm still read as a stretched mobile screen.
2. Alignment pass: expanded the desktop canvas to 1248 px, enlarged the hero and logo, restored the two-line heading, and matched the reference card and CTA placement.
3. Asset pass: hid the mobile-only embedded progress row in the desktop hero so only one five-dot progress indicator remains.
4. Mobile regression pass: corrected the absolute CTA to `width: auto`; the 393 px viewport now has `scrollWidth: 393`.

## Implementation checklist

- [x] Keep the mobile Canvas direction unchanged.
- [x] Use one responsive desktop showroom composition at 900 px and above.
- [x] Keep four image tiles visible in a single desktop row.
- [x] Preserve no-login enquiry flow behavior and avoid any submission during browser QA.
- [x] Run focused front-office tests and a production front-office build.

## Follow-up polish

- Replace the Canvas hero and tile PNGs with higher-resolution source exports if a future brand-art refresh is available.

final result: passed

---

## Showroom desktop follow-up: Canvas fade and spacing

- Desktop hero: replaced the artificial backdrop blur with the Canvas-style white lower fade. The source image remains legible at the edge, then fades cleanly into the page canvas.
- Vehicle cards: added 28 px grid top padding, producing a measured 25 px visual gap between the 600 px hero and the first vehicle card.
- Mobile heading: the live `.showroomProgress` is `display: none` below 640 px; at 393 x 852 it has a zero-sized box, `looking` is clear, and the body is exactly 393 px wide.

final result: passed

---

# Dashboard design QA

Final result: passed

## Visual truth and comparison

- Selected source: `C:/Users/User/.codex/generated_images/01a1693e-2687-7a03-8f53-9c827eeb0fa8/exec-0af91ad4-2d87-438b-a95b-9f1efe396df1.png` (1024 × 1536 pixels).
- Rendered implementation: `../preview-faithful-final/desktop-full.png`, `phone-full.png` and `tablet-full.png`; local Dashboard with intercepted synthetic data. CSS viewports are 1440, 360 and 820 pixels wide, 1000 pixels high, device scale factor 1.
- Full comparison: `../preview-faithful-final/comparison-full.png`; implementation is proportionally normalized to 1024 pixels wide beside the original. The longer implementation includes the explicitly requested visible full-month calendar and retained business definitions/details.
- Focused comparisons: `comparison-overview.png` and `comparison-analysis.png` in that directory. The source content crops are 845 pixels wide; rendered component captures (overview 1136 × 245, analysis 1136 × 1311) are proportionally normalized to that same width. Fixed app chrome is temporarily hidden only for these focused captures, avoiding a sticky header contaminating a scrolled component screenshot. It remains present in full-page/viewport captures.
- State: all-time analytics, one settlement action, payment/debt balances, negative and positive monthly sold margins, enquiry cohort and populated calendar. Calendar fixture dates are normalized to the browser's current day. Actual calculations and fixture totals take precedence over erroneous or simplified image text.

## Comparison history

1. Blocked: the first implementation preserved section order but retained outlined metric tiles, colored top strips, tall separated toolbars, verbose cash rows, line-encoded sold margin and a collapsed day-only calendar. The user rejected its visual direction and calendar discoverability.
2. Fixed: flat page toolbar and panels, divided icon/value metric strip, short cash rows, signed sold-margin bars, grouped analysis with separate projected stock margin. The calendar moved to its own full-width area and defaults to showing the month at every target size. Existing Ant Design icons are used.
3. Blocked: independent visual comparison found narrow selected-day event badges and unused space below the left margin panel.
4. Fixed and recaptured: calendar date content spans the cell width; a contrasting badge displays total count and delivery/busy type cues, with full accessible counts. The margin panel spans the analysis row and its plot uses the available wide-panel height. Regenerated full and focused comparisons were reviewed again; no P0/P1/P2 finding remains.

## Required fidelity surfaces

| Surface | Result |
| --- | --- |
| Fonts and typography | Plain Arial/system Chinese fallback, restrained headings, readable data, tabular currency and fixed 12px chart labels. Corrected inherited heavy metadata and undersized icon glyphs. |
| Spacing and layout | Flat compact headings, divided metric strip, aligned analysis columns, wrapped filters and right-aligned phone actions. Full month visibility is an intentional user-requested departure from the image. |
| Colors and tokens | Existing green actions, neutral borders, restrained category greens, red negative amounts/overdue states. Selected calendar counts retain white-background contrast. |
| Assets and icon quality | No photographic/illustrated assets in the reference. Standard Ant Design icons replace the reference's standard UI icons. Charts remain real SVG data visualizations with exact-value tables, not raster images of data. |
| Copy and content | Preserves real sales counts, payment plus debt balances, current versus cohort/intake periods, independent freshness/error states, unknown due dates, source identities and exact links. No invented monthly sales-revenue series or overdue days. |

## Runtime evidence

- Full back-office suite: 521 passed across 44 files. Production build passed with the existing bundle-size warning.
- Final Dashboard browser checks passed at 360, 390, 720, 721, 820, 1024, 1025 and 1440px. Interaction cases at phone/tablet/desktop verify exact record navigation, distinct actions, filters/reset, independent freshness and injected failures, calendar selection/drawer, date controls and document search. No unexpected console errors were reported.
- Four collection bucket-to-record browser cases passed, including legacy balances, exact record drawers, errors/retry and empty states.
- Three-width density inspection passed with 13 events (8 deliveries, 5 staff-busy events) on the selected day, visible contrasting badges and accessible type counts. The phone date cell opens all 13 events. Badge children fit at all three widths. Thirty-six signed monthly bars and exact-value tables remain readable and unclipped.
- An initial density script clicked the non-interactive image cue rather than the date cell and timed out; the corrected public date-cell interaction passed. That failed script is not counted as passing evidence.
- Evidence: `../evidence-calendar-final/`, `../evidence-faithful-collection/`, `../evidence-calendar-density/`, `../preview-faithful-final/`.

## Intentional differences and limits

The existing app shell, bilingual labels, role-based navigation and complete financial definitions remain. The user explicitly requested full-month visibility rather than the mock's compact agenda. Retained detail disclosures and real refurbishment totals make the analysis taller than the image; they do not invent or discard business data. Monitoring/refurbishment could receive minor visual refinement later, but no blocking visual mismatch remains.

Verification uses local synthetic data in Chromium. Authenticated production, physical-device browsers, Safari and a complete accessibility audit were not performed. No staging, commit, pull request, merge, deployment or WhatsApp activation is included.

### Mobile button refinement, 26 October 2026

At the user's request, Dashboard mobile action, refresh and filter buttons now use a compact 36px presentation. The primary record action retains a 44px tap target with a transparent border around its 36px visible surface. Cash category buttons are content-width and right-aligned instead of stretching across the card. The changes are scoped to Dashboard widths up to 720px in `dashboardWorkspace.css`.

Populated captures at 360, 390, 720, 721, 820 and 1440px show no page overflow or clipped button labels. Existing Dashboard interaction checks passed at 360, 820 and 1440px. The first phone run caught a reduced primary tap target; the transparent hit-area correction passed the subsequent phone run without weakening the checker. Evidence is in `../preview-mobile-buttons/`, `../evidence-mobile-buttons/` (tablet/desktop passes) and `../evidence-mobile-buttons-final/` (corrected phone pass). This CSS-only refinement did not rerun the full unit suite or production build. It remains local and undeployed.

### Release preparation, 26 October 2026

The user authorized deployment after reviewing the mobile refinement. The production build was rerun successfully on the final code. The final independent GPT-6.1 app review found no actionable P0/P1/P2 issue against `origin/main` at `87ea0c0`, including data meanings, exact navigation, filters, freshness/errors and roles. The read-only CLI review was attempted first but rejected the configured model; that attempt is not counted as a passing review. CI, merge, deployment and live smoke evidence are tracked separately in FOO-234.
