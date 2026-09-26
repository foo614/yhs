# FOO-41 management assistant boundary

Planning only. FOO-40 owns notification transport, consent, language preference, outbox and delivery audit. FOO-41 owns verified staff binding, conversational management queries and their authorization. Public `stock` testing does not implement staff identity or management access. No production assistant is enabled.

## Language and shared dependency

Support Bahasa Malaysia by default and English by explicit preference. No Chinese query/response support. Reuse FOO-40 sender verification, opt-out, deduplication, delivery states and audit. A phone allowlist is a test restriction, not proof of staff identity. Test development does not require a monetary budget; identity, authorization, anti-loop controls and opt-out remain mandatory.

## Intent and minimum-field policy

The existing API policies in Program.cs are authoritative. Approved adapters must return projections, not current bulk endpoint records or arbitrary model-selected URLs.

| Intent | Current policy boundary | Permitted response draft |
| --- | --- | --- |
| Vehicle availability/status | VehicleRead and any record visibility checks | Vehicle reference, plate, make/model, status |
| Loan progress | Loans (BossAdmin, Loan) | Vehicle/reference, current progress; exclude documents, identity numbers, rejection reasons |
| Outstanding collection/debt | Finance (BossAdmin, Finance) | Authorized case reference, outstanding total and due date; no bank details or full customer profile |
| Settlement due | Finance | Vehicle/reference, deadline, authorized outstanding amount |
| Realized profit/dashboard | Dashboard (BossAdmin) | Approved aggregate metric and period; no underlying transaction export |

No writes, approvals, exports, downloads, arbitrary SQL or direct model database access. Ambiguous references require clarification before retrieval. Unsupported intents return a short localized refusal or human handoff.

## Threat model and privacy design

Assets: staff identity, customer/finance data, provider credentials, consent and audit integrity. Trust boundaries: unsigned internet webhook to signature-verified event; verified phone to linked staff identity; model intent to allowlisted API adapter; API output to filtered reply.

| Threat | Required control and evaluation |
| --- | --- |
| Forged sender or replay | Exact raw-body signature, configured sender ID, verified phone binding, durable event deduplication; forged and repeated webhook tests |
| Number reassignment or account takeover | Authenticated staff link plus phone challenge, expiry, unique active binding, audited revocation; never bind by a chat claim |
| Disabled staff or downgraded role | Reload current account status and policies on every tool call and before releasing reply; test downgrade during an active session |
| Prompt injection from chat or stored fields | Model cannot select arbitrary tools/URLs/SQL; server validates intent arguments; retrieved text is data; test requests to reveal prompts or override role checks |
| Cross-user/session leakage | Session keyed to verified binding and sender, short expiry, no shared conversation cache; concurrent different-user tests |
| Excessive disclosure | Explicit DTO field allowlists and bounded results; no raw API entity serialization, documents or provider errors; test forbidden-field output |
| Retry loops or quota bypass | Event deduplication, bounded turns/tool calls, configurable per-user/workspace limits and kill switch; test duplicate callbacks and concurrent requests |

Audit intent, authorized adapter, business references, outcome, latency and usage. Exclude raw conversation, credentials, document contents and unnecessary customer fields. Delivery metadata target is 90 days; staff binding/audit retention needs a separately reviewed policy before production. No deletion job is part of this plan.

## Acceptance sequence

1. Complete FOO-40 shared test transport and separate approved production configuration.
2. Review identity linking, this threat model, projected DTOs and privacy retention before assistant implementation.
3. Implement deterministic authorized adapters before model orchestration; test role downgrade, disabled binding, opt-out and cross-record access.
4. Add BM/English intent evaluations, injection cases, usage telemetry and kill switch.
5. Verify integration and full repository checks. Production enablement remains separate from test authorization.
