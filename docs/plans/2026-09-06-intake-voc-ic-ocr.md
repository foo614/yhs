# Intake VOC OCR and IC address correction

## Approved scope

The user approved adding VOC/car-card scanning to New Vehicle intake now, then supplied an IC sample and requested testing because the IC number sometimes populates the Owner address.

- Add optional VOC scanning in the first intake step, before required vehicle fields. Keep existing IC requirements and post-create document OCR.
- The user confirmed English uploaded documents. Accept an English PDF or the existing JPG, PNG and WebP formats within the document 10 MB limit. PDFs must parse successfully, be unencrypted and contain 1-15 pages. IC preview remains image-only; no Chinese OCR or provider migration is included.
- Use the configured Google Document AI service, existing quota and audited preview path. Send accepted PDFs as `application/pdf` raw documents; do not disguise them as images or silently rasterize them.
- Review extracted plate, chassis, engine, make, model and year before applying. Fill blank draft fields only by default; replacing a nonblank value requires an explicit field choice.
- Registered owner OCR is comparison-only. Do not silently create or update a person, approve a vehicle or save a draft.
- On final intake submission, validate the optional VOC before writes and persist it as Seller-owned evidence in the same transaction as the vehicle and IC.
- Fix IC/address separation in extraction and review mapping. An ID-only address must be rejected without discarding real street numbers, five-digit postcodes or a multi-line address.
- The supplied sample may be used for the requested OCR test. Do not persist it as a real Owner or vehicle and do not expose its personal fields in logs or shared reports.

## Ownership and constraints

The vehicle-intake OCR worker owns OCR-only route/parser/client/intake UI changes and focused tests. Concurrent Purchase Invoice workers own separate areas of shared files. Root owns integration, documentation and isolated runtime acceptance. Preserve prior unpublished work. The user subsequently authorized committing and pushing this slice once acceptance is complete; workers do not publish independently. Do not publish while required acceptance is blocked, deploy production, reset business databases or change OCR providers as part of this isolated test run.

## Verification

1. Establish a failing regression for a card-number header or mislabeled address becoming the address.
2. Verify correction preserves real address lines and protects the Owner form mapping.
3. Test optional VOC preview and apply: empty fields, conflicts, invalid year, unsupported image, OCR failure/retry, and cancellation.
4. Test atomic intake with and without VOC, file validation, ownership and no partial writes on error.
5. Use isolated PostgreSQL/API/browser checks and distinguish injected OCR responses from real configured-provider results.
6. Verify PDF limits and malformed/encrypted input rejection before persistence. Confirm the App callback forwards the reviewed original file through the multipart client.
7. Verify scan availability under React StrictMode and protect busy, replacement and unmounted components from stale results.

## Current environment finding

The original running local API container has no Google project, processor or credential mount because it was started with only the base Compose file. This does not mean the user has not supplied credentials. Conversation recovery found the existing authorized local setup in the 31 August `Repair module` task; its credential file remains available outside the repository. The original checkout also contains the local `infra/docker-compose.google-ocr.local.yml` overlay that maps the Google settings and mounts Application Default Credentials read-only.

Using the recovered settings in a separate labelled acceptance container produced real Google OCR output from the supplied IC. The original Docker stack and business database were not restarted or changed. Current dependency injection still selects Google Document AI; no alternative provider was enabled and no production credentials were copied.

The first live result correctly separated the IC number but omitted the no-house-number rural address. Acceptance therefore includes that concrete parser regression, alongside prefixed identity-only continuation lines. Record the final sample result separately from controlled fixtures and from representative English VOC PDF accuracy. Do not request credentials again merely because a new QA container or base-only restart omits this existing configuration.
