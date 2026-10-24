# FOO-229 Finance UI and behavior consistency

The approved outcome is consistent, usable Finance operations across phone,
tablet and desktop. The seven tabs and their record, form and document views
remain Ant Design-based. Version, permissions, financial calculations and
consequential-action confirmations retain their current meaning.

## Implementation

1. Reuse each record's action renderer across mobile cards and desktop rows.
   Keep Details first and restore equivalent permitted shortcuts. Put voucher
   PDF actions in both layouts and the record drawer.
2. Use the existing document drawer for uploaded PDF Preview. Preserve image
   thumbnails, authenticated fetches, supported MIME types, file ownership and
   object URL cleanup. Distinguish original uploads from generated PDFs and
   exact purchase-invoice versions.
3. Track loading and failure separately from valid empty Finance registers.
   Retain unaffected records, suppress unknown totals and offer scoped retry.
4. Repair Finance filter wrapping at intermediate widths, viewer/close targets,
   long-form action reachability and the empty invoice-request queue.

## Coverage

| Page or surface | Record and file coverage |
| --- | --- |
| Sales Invoices and Collections | V2/legacy records, invoice preparation, add payment, evidence upload, original PDF/images, generated invoices/receipts, export |
| Settlement | Details/create, completed/reopened states; no attachments |
| Broker Commission | Details/create, paid/reopened and CP58 preparation states; no generated CP58 file |
| Debt Recovery | Details/create, Customer 360 and follow-up/close actions; no attachments |
| Approvals and Vouchers | Purchase current/history PDFs and Version, delivery accounting review, voucher create/details/generated PDF |
| Daily Spend | Details/create, mark-paid/reopen states; no attachments |
| Cash Handover and Official Receipts | Custody details/create/review, independent decision gates and generated receipt |
| Shared invoice-update queue | Empty/error/populated requests and unchanged resolution confirmation |

## Acceptance

- Check all seven pages at 320, 360, 390, 720, 721, 767, 768, 820, 1024,
  1025 and 1440 pixels, with representative phone/tablet/desktop screenshots.
- Use synthetic populated, long-label/filename/amount and multi-record data.
  Preserve allowed actions and information across layouts and keyboard use.
- Inspect Details, document and form views, disabled/terminal states,
  loading/empty/error, expired authentication, unsupported content and downloads.
- Extend existing tests only for critical finance-data/auth/file/action risks;
  use browser checks for copy, spacing and touch targets. Run affected tests,
  frontend build, independent correctness/UI review and PR CI/CodeQL.
- Deliver a focused PR. Merge and production deployment require subsequent
  human authorization.

## Verified implementation

- Updated against `origin/main` at `db92e4f`; Dashboard and WhatsApp changes
  remain intact. Back-office unit suite passed: 44 files, 520 tests.
- Back-office TypeScript and production build passed. Finance browser checks
  passed at all 11 widths above, plus three financial failure/file/validation
  flows at 320, 820 and 1440 pixels (14 Playwright tests total).
- Synthetic browser checks covered authenticated download bytes and filename,
  expired session without a file download, valid empty after retry, unavailable
  registers, unsupported content, action parity and footer form validation.
  They issued no mutations. Native Chrome displayed the uploaded PDF page.
- Customer 360's existing receipt checks now exercise authenticated downloads
  instead of the replaced anchor links: correct active/legacy source, filename,
  bytes and no download for voided receipts. Its seven browser cases passed.
- Independent correctness and UI reviews found no remaining blocking issues.
  App-native GPT-6.1 Sol review was the approved fallback because the installed
  CLI rejected that model. No global tooling or model downgrade was applied.
- Physical mobile Safari and live financial mutations were not tested.
  CI/CodeQL and the PR delivery record remain separate release gates.
