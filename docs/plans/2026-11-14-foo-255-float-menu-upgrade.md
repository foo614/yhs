# FOO-255: Float menu and approved component upgrade

Scope: replace Dropdown-wrapped fast track with controlled FloatButton.Group click menu, retaining authorized routes, readable touch labels, bounded scrolling, navigation-close and Escape-close. User explicitly chose Pro Components 3.1.15-9 beta and Ant Design 6; pin antd6.7.0 and icons6.3.4 alongside it.

Risks: major DOM/type changes affect custom CSS, ProTable, ModalForm, Drawer and Tour. Preserve APIs, permission checks and business data. No automatic codemod or unrelated redesign.

Implementation: package/lock upgrades; focused compatibility fixes in backoffice source; menu in App.tsx/styles.css. Keep Broker label change in its separate branch and integrate after merge.

Acceptance: production build and existing unit suite pass; critical forms preserve validation and payloads; mobile/tablet/desktop populated routes and fast-track actions are usable without page overflow. Existing CI responsive/security gates required before release. Beta version is explicitly approved, not represented as stable.

Verification: full workspace build and lint pass; 523 existing unit tests pass (the obsolete v5 React 19 renderer shim and its test are removed). Synthetic Inspection duplicate validation/save passes at 390/820/1440; task time-range validation and Tour bounds pass at 320/390/820/1440. Independent compatibility review found no blocking issue. Broader browser regression and release gates remain required. Existing supported v6 deprecation warnings are explicitly listed in the browser harness; real errors are not suppressed.
