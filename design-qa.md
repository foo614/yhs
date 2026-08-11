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
