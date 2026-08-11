# Admin login redesign QA

source visual truth path: `C:\Users\User\AppData\Local\Temp\codex-clipboard-4d3bb234-8b1b-4ac6-b83f-c7a094418049.png`
implementation screenshot path: `C:\Users\User\AppData\Local\Temp\ysheng-admin-login-desktop.png`
comparison input: `C:\Users\User\AppData\Local\Temp\ysheng-admin-login-comparison.png`
mobile screenshot path: `C:\Users\User\AppData\Local\Temp\ysheng-admin-login-mobile.png`

## Capture setup

- Desktop viewport: 2048 x 756 CSS pixels.
- Source pixels: 2048 x 756.
- Implementation pixels: 2048 x 756.
- Device pixel ratio: 1; no density normalization required.
- Responsive check: 1280 x 720 and 390 x 844.
- Desktop state: normal login state with seeded email visible and password empty.
- Source state: prefilled credentials with a visible failed-login alert. Password state was not reproduced in the implementation capture because browser QA did not transmit a password merely to manufacture an error state.

## Full-view comparison evidence

The combined comparison shows the redesigned implementation preserves the reference's two-region login composition while improving hierarchy: a branded workspace surface on the left and a focused staff sign-in card on the right. The implementation uses the supplied YS Heng logo at the same role, keeps the teal brand family, and removes the decorative grid background in favor of a calmer operational surface.

## Focused-region comparison evidence

- Brand/header: logo, portal name, staff-access badge, and supporting copy remain prominent and readable.
- Workspace modules: six existing Ant Design icons are retained and grouped into a compact 3 x 2 module grid with truthful descriptions.
- Sign-in form: work-email and password fields, primary submit action, focus affordance, and error alert styling remain compatible with the existing form behavior.
- Responsive card: at 390 x 844 the hero is hidden and the form becomes a single readable card with no horizontal overflow.

## Findings

No actionable P0, P1, or P2 visual findings remain.

The first rendered pass exposed a P2 laptop issue: the 1280 x 720 viewport had a small vertical overflow. The intermediate desktop breakpoint was tightened, then rechecked at 1280 x 720 with body scroll size exactly matching the viewport.

## Comparison history

1. Initial implementation at 2048 x 756: overall layout and visual hierarchy were coherent, but the first 1280 x 720 check produced 45px of vertical overflow.
2. Fix: added a 1025-1400px desktop breakpoint with reduced panel padding, tighter hero gaps, smaller intro heading, and more compact module cards.
3. Post-fix evidence: 1280 x 720 body scroll size is 1280 x 720; 2048 x 756 body scroll size is 2048 x 756; 390 x 844 body scroll size is 390 x 844. Browser console error log was empty.

## Implementation checklist

- [x] Preserve cookie-login form behavior and existing auth API contract.
- [x] Preserve supplied logo and existing Ant Design icon library.
- [x] Improve desktop hierarchy and operational trust cues.
- [x] Keep the form responsive on mobile.
- [x] Check required-field validation without transmitting a password.
- [x] Run back-office tests, lint, build, and `git diff --check`.

## Follow-up polish

The captured source shows a failed-login state while the implementation capture shows the normal state. If the exact error-state copy/layout needs a pixel-level pass later, capture it from a safe local test fixture rather than submitting credentials through the browser.

final result: passed
