# Google Stitch Visual Reference Handoff

Reference URL:

```text
https://stitch.withgoogle.com/projects/5674326425334870589
```

## Current Access Result

The project URL resolves to a Google Stitch page titled `Stitch - Projects`, but the browser-accessible document currently exposes only an empty application shell:

- Visible/body text: empty.
- DOM root: `APPCOMPANION-ROOT`.
- Loaded Google application scripts are present.
- No inspectable screen names, components, images, colors, layout measurements, or export assets are available through the current unauthenticated/browser session.
- Browser screenshot capture timed out against the loaded shell, so no reliable visual screenshot could be captured from this environment.

Because of that, the current implementation treats Stitch as a visual reference that still needs exported evidence before exact visual matching can be verified.

## Assets Needed For Exact Matching

Provide one of the following when exact Stitch matching is required:

- PNG/JPG screenshots for the public home, inventory, vehicle detail, lead form, login, dashboard, vehicle intake, loan, delivery, repair, finance, leads, audit log, and admin screens.
- A Stitch export package with images, icons, color tokens, typography tokens, and spacing/layout notes.
- Direct screen captures from a signed-in account with access to the Stitch project.

## Current MVP Visual Direction

Until the Stitch visuals are available, the implemented UI follows the functional requirements and domain fit:

- Public front office: Next.js vehicle sales experience with bilingual English/Chinese content, inventory filters, vehicle detail pages, photo fallback, and lead capture.
- Back office: Ant Design Pro-style operations portal with dense workflow tables, forms, role-scoped routes, dashboard metrics, reminders, uploads, and staff admin.
- API: .NET 10 backend with PostgreSQL persistence, Identity cookie auth, role policies, workflow validation, reminders, audit logs, and blob uploads.

## Verification Boundary

Current verification proves the MVP behavior and deployment scaffolding, but not pixel-level Stitch fidelity. The primary gate remains:

```powershell
.\infra\verify-local.ps1
```

When Stitch assets become available, add visual regression checks or browser screenshot comparisons for the affected front-office and back-office screens, then update this handoff with the asset source and verification command.
