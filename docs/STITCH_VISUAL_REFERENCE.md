# Google Stitch Visual Reference Handoff

Reference URL:

```text
https://stitch.withgoogle.com/projects/5674326425334870589
```

## Current Access Result

The project URL resolves to a Google Stitch page titled `Stitch - Projects`. A current in-app browser inspection can see the top-level Google application shell and one embedded cross-origin iframe:

- DOM root: `APPCOMPANION-ROOT`.
- Iframe title: `Stitch - Design with AI`.
- Iframe source host: `app-companion-430619.appspot.com`.
- Visible canvas state: dark dotted Stitch canvas, `Web UI Prototype` header, sign-in button, Stitch safety banner, canvas zoom near `5%`, and small prototype thumbnails.
- Visible overlay copy includes `Prototype created` and the prompt `Want to ask Stitch to do something? Remix this project to make your own updates!`.
- The iframe is cross-origin/out-of-process, so browser automation can screenshot the canvas but cannot inspect the iframe DOM, screen hierarchy, generated component code, images, color tokens, typography tokens, or layout measurements.

Because of that, the current implementation treats Stitch as a visual reference that still needs exported evidence before exact visual matching can be verified. The available canvas screenshot proves the project exists and contains a web UI prototype, but it is not enough to reproduce or validate the prototype pixel-for-pixel.

## Assets Needed For Exact Matching

Provide one of the following when exact Stitch matching is required:

- PNG/JPG screenshots for the public home, inventory, vehicle detail, lead form, login, dashboard, vehicle intake, loan, delivery, repair, finance, leads, audit log, and admin screens.
- A Stitch export package with images, icons, color tokens, typography tokens, and spacing/layout notes.
- Direct screen captures from a signed-in account with access to the Stitch project.
- A high-zoom canvas screenshot where each screen is legible, if a full export is not available yet.

## Current MVP Visual Direction

Until the Stitch visuals are available, the implemented UI follows the functional requirements and domain fit:

- Public front office: Next.js vehicle sales experience with bilingual English/Chinese content, inventory filters, vehicle detail pages, photo fallback, and lead capture.
- Back office: Ant Design Pro-style operations portal with dense workflow tables, forms, role-scoped routes, dashboard metrics, reminders, uploads, and staff admin.
- API: .NET 10 backend with PostgreSQL persistence, Identity cookie auth, role policies, workflow validation, reminders, audit logs, and blob uploads.

## Verification Boundary

Current verification proves the MVP behavior and deployment scaffolding, but not pixel-level Stitch fidelity. The current browser-visible Stitch canvas can be used only as coarse evidence until exported assets or legible screen captures are available. The primary gate remains:

```powershell
.\infra\verify-local.ps1
```

When Stitch assets become available, add visual regression checks or browser screenshot comparisons for the affected front-office and back-office screens, then update this handoff with the asset source and verification command.
