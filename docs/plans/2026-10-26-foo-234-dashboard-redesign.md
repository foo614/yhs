# FOO-234: Dashboard redesign plan

Status: the approved redesign and compact mobile buttons are implemented and verified locally. On 26 October 2026 the user authorized deployment. Git integration, required CI/security checks, the production workflow and live smoke evidence are tracked in FOO-234.

Latest revision: the user rejected the first implementation's generic appearance and compact day-only calendar. The page now follows the selected image's internal composition: flat toolbar, divided icon/value metric strip, short cash rows, signed sold-margin bars and grouped analysis. The calendar is an intentional change from the image: a full-width month is visible by default, with per-day event/type counts and selected-day details. See `design-qa.md` for the completed visual comparison and verification.

## Outcome and baseline

Give BossAdmin a clear answer to three questions: what needs attention, what is happening with money and stock, and how the business is performing over a chosen period.

The current-run review used main `87ea0c0` with synthetic populated records at 360, 820 and 1440px. The page measured 10,103px on phone and 5,949px on desktop with one priority task. On phone the first Act now record began about 725px below its section heading. Existing interaction checks passed, but the screenshots showed weak hierarchy, small chart labels, truncated meaning and awkward tablet rows. These are local observations, not authenticated production evidence.

Use existing data and Ant Design conventions. Preserve BossAdmin access, calculations, current-versus-period definitions, independent timestamps/errors, collection due-date limitations, queue identities and exact-record links. WhatsApp, other modules, APIs, database changes and new business metrics are outside this redesign.

## Proposed page structure

| Area | Default presentation | Detail access |
| --- | --- | --- |
| Management overview | Compact heading and four headline metrics, with period-based sales/margin visually separated from current collection/stock margin. Keep units and time basis visible. | Existing metric drill-downs and calculation explanations. |
| Current work | Act now queue gets the primary space beside short cash follow-up rows. A full-width monthly calendar below shows event dates by default, with selected-day details. Department workload is a secondary filter. | Full reminder inbox, department filters and all calendar events remain accessible. |
| Business analysis | Keep the analytics range beside the charts it controls. Group sales with sold margin, demand with lead follow-up, and stock with repair/cost exposure. | Existing record/category drill-downs and readable chart values. |
| System monitoring | Compact document/OCR health summary at the bottom. | Expand category breakdowns, usage and document search. Show failure status even when details are collapsed. |

One analytics range controls the existing period-based data in overview and analysis. It does not filter current balances, stock, action queues or calendar dates. Show its label beside affected metrics and repeat the same controlled selector in the analysis heading; do not introduce a second independent range.

Keep one full reminder inbox. Act now is its urgent/department work view; the inbox becomes an explicit secondary view without losing records. Remove overlapping manual/generated search surfaces and keep one labelled filter set per view. Collapsed sections must not hide an error or imply that unavailable data is zero.

## Layout and interaction specification

| Surface | Planned behavior |
| --- | --- |
| Phone | Single column. Compact Act now status and refresh row; open detailed filters through a standard Ant Design control. Show active filters and reset inline. Each task keeps status, title, source, subject, date, amount and a right-aligned action. Secondary panels expand explicitly. |
| Tablet | Use task cards or compact rows where the full desktop table cannot fit. Identity, amount and record action must be readable together without horizontal scrolling. Allow filter controls to wrap without truncating the selected value. |
| Desktop | Use a primary work column with compact context alongside it where space permits. Use intentional paired analysis panels. Keep the single right-fixed record action column for tables. Avoid unpaired half-width panels and excessive empty space. |
| Typography and spacing | Reuse the app font and spacing scale: 8px within small groups, 16px within sections, 24px between major groups. Use readable body text and at least 12px rendered chart labels. Keep currency with its amount, allow labels to wrap, and use tabular numerals for comparisons. |
| Color and states | Use the existing primary green for actions; reserve red/orange for actionable risk. Keep tags content-width. Use text as well as color for status. Retain explicit loading, empty, filtered-empty, unavailable and stale-after-failure states. |

A refresh failure keeps the last successful timestamp and visibly identifies the affected panel. A busy or incomplete queue must never display All clear. Changing a filter resets pagination appropriately; changing a chart range must not make unrelated panels look newly refreshed.

## Chart decisions

| Existing content | Decision |
| --- | --- |
| Sales headline and sold vehicle margin | Keep the existing sales total and sold-margin trend together with clear units and actual displayed dates. Do not add a monthly sales-revenue series; the existing trend contract supplies margin and sold counts. Use readable axes/values and a text or table equivalent. |
| Projected stock margin | Show as current stock context. Separate it from sold-margin trends so two different time bases are not presented as directly comparable series. Retain the existing intake-month breakdown in its own chart or accessible detail. |
| Department workload | Keep horizontal category comparison and full-queue counts, using a compact secondary presentation. Selecting a department retains the existing filter/reset behavior. |
| Outstanding collection ageing | Give the active balance and Unknown due date a clear place. Compress zero buckets without removing their labels or record access. Never derive overdue status from invoice, creation or follow-up dates. |
| Lead status/follow-up | Use a compact status distribution. Do not present a measured stage-to-stage conversion funnel without transition evidence. |
| Vehicle ageing and repair costs | Group current unsold-stock ageing and current stock repair-cost exposure. Keep refurbishment analysis, which uses repair jobs created in the selected period, in period-based analysis with its own date label. Use ordered category bars and concise ranked records. |
| Document/OCR statistics | Keep detailed charts and category tables in the lower-priority monitoring view. Preserve existing metric caveats. |

The user-supplied [AntV skills](https://github.com/antvis/chart-visualization-skills) inform chart selection, semantic color, responsive sizing and label density. Baseline implementation uses existing renderers. Evaluate G2 only for charts whose readable labels/interaction cannot be achieved simply with those renderers. If G2 is proposed, first document the exact chart scope, bundle impact, keyboard/text alternative and dependency decision. Do not rewrite every chart or send operational data to a hosted chart-generation service.

## Delivery sequence and ownership

| Batch | Work and deliverable | Exit condition |
| --- | --- | --- |
| 0. Visual direction | Produce a desktop composition and a phone composition covering the entire page structure, plus a tablet Act now detail. Use the same populated fixtures as the baseline. Include error and empty-state treatment. | The proposed layout is concrete and reviewable. Agree the visual direction before application implementation. |
| 1. Structure and work queue | Implement the agreed page groups, compact Act now controls, responsive records, secondary reminder/calendar access and monitoring disclosure. | First-task visibility, useful tablet amounts, filter/reset behavior, freshness/errors and exact navigation pass. |
| 2. Metrics and charts | Fix currency wrapping, chart labels, semantic grouping, collection presentation and duplicate filter surfaces. Keep definitions and source data intact. | Charts are legible at every target size, dates/units remain explicit and existing drill-downs work. |
| 3. Integrated acceptance | Compare against the selected compositions; review populated, loading, empty, filtered-empty, failed-refresh and dense/long-label states. Complete the focused checks and independent review. | Documented evidence and a reviewed implementation are ready for the separately authorized Git/PR/release steps. |

The primary implementer owns `App.tsx`, `styles.css` and integration. Changes to `modules/dashboard/CollectionAgeingPanel.tsx`, `collectionAgeing.css` and `modules/shared/OperationsCalendar.tsx` are limited to agreed presentation needs. Create a focused Dashboard component only if the composition requires separating an existing block; avoid a general layout framework.

Reuse the existing UI reviewer for design and final acceptance. After the diff exists, use one independent correctness review for navigation, filter and freshness regressions. Work on shared layout files is sequential; a separate chart task may run in parallel only after its input contract and owned files are fixed.

## Checkable acceptance

- At 360px with the baseline populated fixture, the first Act now record begins within 360px of its section heading, compared with about 725px today. Its identity, status, due date, amount and action must all fit within the first 900px of the section, matching the baseline phone viewport height. Primary record information is not hidden to meet these targets.
- At 820 and 1024px, task identity, due date, amount and action can be read together without horizontal table scrolling.
- At 1440px, aim to reduce the default expanded page height by at least 30% against the same baseline fixture. This is a secondary target; task usability and retained information take precedence. Use deliberate grouping and secondary disclosure, without shrinking text or hiding primary records. Validate the target during the visual-direction batch.
- No page-level horizontal overflow at 360, 390, 720, 721, 820, 1024, 1025 and 1440px. Test long bilingual names, large amounts, many tasks and active filters.
- Currency and amount stay together; important status/meaning is not ellipsized. Chart labels remain at least 12px after rendering, with readable values for keyboard and touch users.
- Primary touch targets are at least 44px; controls have visible keyboard focus and labels. Verify contrast for text and chart/status colors; screenshots alone do not establish accessibility compliance.
- Identical-looking requests remain separate; duplicate sources for one record merge once. Record actions still open the exact loan, delivery, leave or finance record.
- Full-queue counts, selected filters and visible counts remain distinguishable. Reset, department selection and pagination retain their existing meanings.
- Current balances remain current. Analytics ranges, calendar dates and each panel's freshness retain their independent meanings. Unknown due dates remain explicit.

## Verification and release boundary

Implementation reused `dashboard.test.ts`, `App.test.ts`, the existing table UI contract, calendar coverage and responsive/collection browser checks. Existing financial chart assertions now cover the signed SVG paths and exact negative amounts. The table contract recognizes the reminder inbox's single labelled filter set. No new presentation-only test cases were added.

Record screenshot evidence separately from tests, authenticated production checks and physical-device/Safari checks. Confirm the final diff preserves unrelated work. Follow `docs/BRANCHING_STRATEGY.md` for authorized commit, PR, required CI/CodeQL, merge and release. This plan does not authorize those actions or enable WhatsApp templates.

## Batch 0 progress

The user approved proceeding after reviewing the plan. Desktop, phone and tablet concepts have been generated and presented in the current chat, using the current-run screenshots as visual references. These are synthetic image concepts, not implemented screens or proof of viewport measurements.

The desktop revision removes an invented monthly sales-revenue series and keeps the existing margin and enquiry series. Implementation uses content-width right-aligned task actions, no extra Search trigger or invented overdue-day calculation, explicit period captions and retained record links for every ageing bucket.

## Implementation and acceptance result

The page now groups management metrics, current work, business analysis and system monitoring. Act now has compact filters and tablet/phone task cards; cash and the expanded monthly calendar provide context. Detailed reminders, workload, stock analysis and monitoring remain available through labelled disclosures. The analysis range is synchronized across both selectors. Sold-margin bars and the intake-month stock-margin line are separate readable SVG charts, with exact-value tables and a minimum rendered label size of 12px. No dependency, API, permission, calculation or WhatsApp configuration changed.

| Local check | Result |
| --- | --- |
| Focused Dashboard, App and calendar unit checks | 56 passed. |
| Full back-office unit suite | 521 passed across 44 files. |
| Production build | Passed; existing chunk-size warning remains. |
| Eight-width geometry | Passed at 360, 390, 720, 721, 820, 1024, 1025 and 1440px. The observed 1025px grid overflow was corrected. |
| Dashboard interaction checks | Passed at 360, 820 and 1440px: distinct record identity, exact loan/delivery navigation, workload and due filters, reset, separate freshness clocks, injected panel failures, calendar, document search and date range controls. |
| Collection ageing browser flow | Four width cases passed, including keyboard bucket links, legacy balances, exact records, empty/error/retry and unavailable source states. |
| Dense data and keyboard inspection | Passed at 360, 820 and 1440px with 24 long bilingual tasks, RM9,999,999.99 amounts, 36 months with losses, chart value tables, month expansion and collapsed filtered reminder counts. |
| Independent final review | No remaining blocker found. Earlier intake-period and collapsed-count findings were fixed; help and empty-calendar whitespace was reduced. |

With the baseline financial/action fixture and calendar events normalized to the browser day, the final desktop page is 3,555px high. The original baseline was 5,949px; the populated, always-visible month now takes additional deliberate space. Phone height is 6,683px versus the original 10,103px. The first phone task begins 277px below Act now, compared with about 725px before; its action is within 558px of the section heading. No page overflow was observed in the final target-width checks. These are fixture observations rather than exact comparisons of identical calendar states.

The responsive harness now ignores animations inside closed native details when waiting for visible UI motion to settle. It opens the new disclosures before checking their content and recognizes the active mobile filter button. Earlier timeout/failure runs are superseded by the successful corrected runs, not counted as passes.

Final screenshots, comparison boards and measurements are retained outside source in this worktree's sibling `preview-faithful-final/`, with browser evidence in `evidence-calendar-final/`, `evidence-faithful-collection/` and `evidence-calendar-density/`. The subsequent mobile button refinement is recorded in `design-qa.md` and `preview-mobile-buttons/`. Earlier iteration evidence remains in its original folders. They use synthetic, intercepted local API data. Authenticated production, physical devices, Safari and a full accessibility audit remain unverified by these local checks. Release evidence is recorded separately in FOO-234.
