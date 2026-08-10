# Homepage hero design QA

**Source visual truth path**

`C:\Users\User\AppData\Local\Temp\codex-clipboard-e11daaa8-a762-4ba1-9366-b94100d6522c.png`

**Implementation screenshot path**

In-app Browser capture from `http://localhost:3010/` (ephemeral browser screenshot buffer, captured 2026-08-11; no durable file path was provided by the browser bridge).

**Viewport and normalization**

- Source: 1447 x 676 pixels.
- Implementation: 1280 x 720 CSS pixels at device scale factor 1.
- State: English home page, API inventory unavailable.
- Full-view evidence: the source and implementation were placed side-by-side in one normalized 2560 x 720 comparison image. The source was scaled to 1280 x 598 and centered vertically; the implementation retained its 1280 x 720 browser capture.
- Focused region: hero copy, price-bay art, search dock, CTA, and filter fields were readable in the combined comparison. A separate crop was unnecessary.

**Findings**

- [P1] Data-driven price cards and inventory summary cannot be visually verified.
  Location: `.heroPriceTags` and `.heroInventorySummary`.
  Evidence: the implementation correctly rendered zero tags and no ready-car summary because the local public API is unavailable. The source has two price cards and a 120-ready-cars summary.
  Impact: the requested data-rich above-the-fold state cannot be confirmed without a healthy inventory API.
  Fix: restore the public API and capture the same viewport with two available vehicles. Do not add sample inventory to the production fallback.

- [P3] The supplied source is a hero-only crop, while the production capture includes the existing fixed navigation.
  Location: page frame.
  Evidence: the reference begins below the header; the implementation preserves the live navigation above the hero.
  Impact: this is an intentional product-shell difference, not a hero-layout mismatch.
  Fix: none unless the header is explicitly included in a replacement visual reference.

**Required fidelity surfaces**

- Fonts and typography: the hero uses the installed browser display fallback with a condensed horizontal scale to preserve the two-line, high-contrast composition; kicker, body, labels, and CTA hierarchy match the reference's role and scale.
- Spacing and layout rhythm: the copy begins below the fixed header, the stage occupies the right two-thirds, and the white filter dock is anchored along the hero base with four fields, CTA, and optional inventory rail.
- Colors and visual tokens: white/warm-gray ground, black display copy, YS Heng red accent, white cards, subtle neutral borders, and shallow shadows were matched.
- Image quality and asset fidelity: the committed `hero-price-bay-option2.png` is used directly; no CSS or inline-SVG vehicle artwork was introduced. Lucide icons remain the existing product icon library.
- Copy and content: reference copy is implemented in English and localized in Chinese. Price and ready-car values come only from public inventory.

**Comparison history**

1. The first rendered pass wrapped the black title into two lines. It was corrected by keeping the headline on one line and using the condensed display treatment. The revised combined comparison shows the intended two-line black/red headline.
2. The revised pass has no remaining hero composition mismatch at the tested viewport. The remaining P1 is the unavailable inventory state, which intentionally suppresses price tags and count.

**Implementation checklist**

1. Restore the local public API and re-run the same browser comparison with real inventory.
2. Confirm two price cards bounce in once and each links to its corresponding make/maximum-price search.
3. Confirm the ready-car count uses the returned inventory length and is never shown from a fallback.

**Follow-up polish**

- Recheck the display-font rendering on the production browser stack after deployment; the current treatment intentionally relies on a safe local fallback to avoid introducing a new font dependency.

**Final result**

blocked
