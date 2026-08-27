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
