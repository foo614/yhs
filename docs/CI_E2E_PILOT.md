# CI baseline and isolated E2E pilot

Ticket: FOO-213. Baseline captured 2026-10-13 against remote main `bfbcac34592dfe08cfac71c549a111aed30499d3`.

## Decision

Keep the existing PR workflow, responsive coverage, required checks, and deployment unchanged. Introduce a separate manually invoked real-browser pilot. Do not enable it on pull requests, pushes, or a schedule, or promote it to a merge/deployment requirement before runner measurements demonstrate acceptable latency and reliability.

The pilot addresses failures the mocked responsive suite cannot detect: real Identity cookie login/logout, server-side permission rejection, and persisted business data readback. Use an isolated PostgreSQL database and synthetic identities; app API calls must not be mocked. The broad five-flow plan remains incremental, not an immediate five-flow PR gate.

## Observed baseline

Read the latest 20 PR runs of `ci.yml`, covering October 3-10. All returned final conclusions were success. These are historical observations across different commits, not 20 repetitions of a fixed revision.

Wall time is workflow creation to last non-skipped CI job completion, including queue/dependency waits and report merge. CodeQL, manual production deployment and human environment approval are excluded. Job seconds are summed active job durations; they approximate resource consumption but are not invoiced minutes. Jobs API uses the latest attempt, so earlier rerun resource consumption is not included and this sample cannot establish a first-attempt flake rate.

| Sample | Count | Median wall time | Observed P95 (nearest rank) |
| --- | --- | --- | --- |
| Back-office only | 5 | 223 s (3m43s) | 277 s (4m37s) |
| API only | 4 | 123 s (2m03s) | 323 s (5m23s) |
| Any back-office scope, including shared/full | 15 | 231 s (3m51s) | 657 s (10m57s) |
| All observed PR runs | 20 | 223 s (3m43s) | 463 s (7m43s) |

No front-office-only run occurs in this sample. Small group P95 values are descriptive and not a reliable long-term service objective. The current sample already exceeds the aspirational three-minute PR target.

### Bottleneck evidence

- [Latest back-office-only PR](https://github.com/foo614/yhs/actions/runs/38065199406): 277 s overall; Web apps 66 s; slowest responsive job 241 s; its browser installation 23 s, browser test step 190 s; merged report job 27 s.
- [Frontend dependency PR](https://github.com/foo614/yhs/actions/runs/37812866499): 657 s overall. Slowest responsive job installed the browser/dependencies for 427 s, then tested for 176 s. This is evidence of setup variability, not proof all slow runs share that cause.
- [API-only PR](https://github.com/foo614/yhs/actions/runs/37886754209): 323 s overall although API job execution was 121 s. Queue/dependency waiting is materially different from test execution.

Do not label the whole delay as frontend build time. Investigate slow installs separately before choosing browser images or caching; additional shards also add setup cost.

| Run | Observed active scope | Wall seconds | Summed job seconds |
| --- | --- | --- | --- |
| [38065199406](https://github.com/foo614/yhs/actions/runs/38065199406) | back | 277 | 636 |
| [38059747335](https://github.com/foo614/yhs/actions/runs/38059747335) | api + deployment | 104 | 185 |
| [37947577924](https://github.com/foo614/yhs/actions/runs/37947577924) | api | 114 | 109 |
| [37886754209](https://github.com/foo614/yhs/actions/runs/37886754209) | api | 323 | 128 |
| [37883063336](https://github.com/foo614/yhs/actions/runs/37883063336) | api | 132 | 127 |
| [37817053264](https://github.com/foo614/yhs/actions/runs/37817053264) | back + api | 273 | 731 |
| [37812866499](https://github.com/foo614/yhs/actions/runs/37812866499) | front + back | 657 | 1074 |
| [37663641242](https://github.com/foo614/yhs/actions/runs/37663641242) | front + back + api + deployment | 463 | 1088 |
| [37657999364](https://github.com/foo614/yhs/actions/runs/37657999364) | back + api + deployment | 301 | 815 |
| [37654557277](https://github.com/foo614/yhs/actions/runs/37654557277) | back + api | 223 | 725 |
| [37645929679](https://github.com/foo614/yhs/actions/runs/37645929679) | back + api + deployment | 245 | 881 |
| [37644019358](https://github.com/foo614/yhs/actions/runs/37644019358) | back | 231 | 647 |
| [37631931117](https://github.com/foo614/yhs/actions/runs/37631931117) | back + api + deployment | 262 | 808 |
| [37216082815](https://github.com/foo614/yhs/actions/runs/37216082815) | back | 216 | 565 |
| [37214258236](https://github.com/foo614/yhs/actions/runs/37214258236) | api | 99 | 95 |
| [37136866549](https://github.com/foo614/yhs/actions/runs/37136866549) | back | 223 | 617 |
| [37135992678](https://github.com/foo614/yhs/actions/runs/37135992678) | back | 217 | 545 |
| [37135537182](https://github.com/foo614/yhs/actions/runs/37135537182) | front + back | 212 | 603 |
| [37135020330](https://github.com/foo614/yhs/actions/runs/37135020330) | front + back + api + deployment | 206 | 777 |
| [37134123927](https://github.com/foo614/yhs/actions/runs/37134123927) | front + back + api + deployment | 202 | 703 |

## Pilot acceptance

- Independent manual workflow; no production credentials, deployment job, PR trigger or changes to existing CI dependencies.
- Serve the built back office, call the actual API, and wait for database-backed readiness with bounded deadlines.
- Restrict target URLs and database configuration to a disposable local environment. Reject non-loopback application targets and ambiguous existing database targets.
- Genuine UI login must establish the cookie used for protected operations; verify unauthorized and forbidden responses, not only hidden controls.
- A persisted mutation must be checked after reload/readback; fallback/demo data must not turn API failures into passes.
- Publish stage timings for dependencies, browser installation, builds, application startup/readiness, tests and reporting, plus job timestamps where available. Failures remain failures.
- First establish deterministic local behavior, then gather GitHub hosted runner results. Local durations do not prove hosted-runner performance.
- Keep one worker initially. Increase concurrency only after account/data isolation and measured resource usage justify it.
- Negative validation must show an unavailable API or invalid authentication actually fails. Do not export reusable authentication state or use real records. Failure traces may contain synthetic session cookies and test credentials; restrict artifact access and retain them for seven days.

## Running the pilot

After this workflow is registered on the default branch, manually dispatch **Back-office real E2E pilot** and select the intended revision. There is no deploy input, production environment or repository secret dependency. Each hosted job gets its own disposable PostgreSQL service. Do not add this workflow to required checks yet.

For local browser validation, use a dedicated disposable PostgreSQL database and start the API with Development seeding, synthetic accounts and all workers/outbound integrations disabled. Build the back office with `VITE_API_BASE_URL` matching that API, then serve the production preview. Set `E2E_BASE_URL` and `E2E_API_BASE_URL` to the matching loopback origins and run `npm --workspace apps/backoffice run test:e2e:pilot`. Both applications must use the same loopback hostname so their cookie behavior matches CI. The Bash service lifecycle helpers target Linux runners, not Windows process management.

The administrator test creates its own synthetic owner and private vehicle through the authenticated API. It then changes the chassis value through the UI and checks it after reload. Fixture creation is setup, not proof of UI vehicle intake. The independent Sales context verifies permitted vehicle access and forbidden Finance/Admin access. Both flows verify logout invalidates protected API access. Run against a fresh database; the pilot does not delete fixture records from a reused database.

Artifacts are under `artifacts/e2e-pilot`: stage receipts in `timing.jsonl`, flow receipts, HTML report, service logs, and failure-only screenshots/traces. `artifact-collection` measures inventory creation, not upload time. Use GitHub job/step timestamps to include runner queueing, PostgreSQL service setup, action setup, cleanup and artifact upload in the end-to-end result. Summed job time and PR critical-path latency are separate metrics.

## Local verification on 2026-10-13

- Actual production preview, actual .NET API and an isolated native PostgreSQL 17 cluster: both browser tests passed in **9.7 seconds**, with one worker and no retries. This is browser suite time only.
- After local review identified missing receipts on early failures, receipt finalization moved into a fixture teardown. API-unavailable validation produced both failed receipts including collected errors; the corrected suite then passed both flows in **12.1 seconds**, with passed receipts and zero collected errors. These are individual runs, not a statistically established speed change.
- API build including restore: **22.4 seconds**, zero errors/warnings. Back-office production build: **11.0 seconds**, existing chunk-size warning only. npm clean install took approximately **42 seconds**. These are separate local measurements, not a hosted-job forecast.
- Wrong administrator password: the login test failed as expected, exit 1; failure screenshot and trace were produced in a separate output directory.
- Connection parser rejected a `Server` alias, duplicate host and non-pilot database; startup rejected an occupied API port. Non-loopback browser targets were rejected before execution.
- Timing wrapper preserved success and failure exit codes; Node syntax, back-office type check, Bash syntax, workflow actionlint and diff whitespace checks passed. Independent security re-review found no remaining blocker.
- Docker Desktop's Linux engine was unavailable locally. Browser/API persistence proof used a new loopback-only native PostgreSQL cluster, not an existing development database. Linux process-group lifecycle and the hosted PostgreSQL service still require the first real GitHub run.
- Existing PR workflow, path classifier, required checks, production code, database schema/seed code and deployment behavior were not changed. No new dependencies were added.

During test development, editing the existing `VPK1234` seed vehicle returned `vehicle_customer_active_loan_required`: it has a pending loan but no canonical customer association. This is a pre-existing seed-data inconsistency, not corrected by this ticket. The basic persistence pilot now uses a dedicated valid fixture; it does not claim to cover loan-linked edits.

Hosted pilot performance remains **unverified**. Do not promote the pilot or claim zero observed remote latency regression based on local browser timing alone.

## Promotion criteria

Compare like-for-like change scopes and the same tested revision. Collect a representative hosted-runner sample, including first-attempt outcomes, before adding any new required PR check. The speed requirement is no observed regression against the corresponding baseline, not permission for a six-to-seven-minute PR.

Three-minute routine PR feedback is an optimization target, not a measured promise. If the pilot does not fit the existing critical path, keep it manual while optimizing or propose a post-merge release gate explicitly. Do not silently move delay to deployment, weaken current checks, or treat timeouts as success.

A future post-merge result can only be reused for release when it matches the exact release SHA and required test configuration and completed successfully. This pilot does not alter release gating or implement that reuse.

## Engineering references

- [Google: layered testing and a small E2E layer (2015)](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html).
- [Slack: pre-merge, post-merge and regression pipelines (2022)](https://slack.engineering/balancing-safety-and-velocity-in-ci-cd-at-slack/).
- [Spotify: measuring and addressing flaky tests (2019)](https://engineering.atspotify.com/2019/11/test-flakiness-methods-for-identifying-and-dealing-with-flaky-tests).
- [Playwright best practices](https://playwright.dev/docs/best-practices) and [CI recommendations](https://playwright.dev/docs/ci).

These sources inform the design; they do not establish that YS Heng has the same infrastructure or performance.
