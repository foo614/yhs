# Production Observability Runbook

## Telemetry flow

The API (`service.name=ysheng-api`) and reminder worker (`service.name=ysheng-worker`) authenticate with a dedicated bearer token and send OTLP/gRPC over an isolated internal telemetry network to the `otel-collector` service. The Collector adds `deployment.environment.name=production` and `service.namespace=ysheng`, then fans logs, metrics, and traces out to both destinations:

1. the internal authenticated Aspire dashboard at `production-dashboard:18889`; and
2. the Grafana Cloud OTLP/HTTP gateway for stack `fld614`.

Neither the Collector nor either OTLP receiver publishes a host port. The Collector alone joins a separate outbound-capable bridge for Grafana HTTPS; no application or proxy peer joins that egress network. A minimal internal-only health sidecar probes the running Collector `health_check` extension; API and worker startup wait for that runtime probe rather than a config-only validation. The Collector uses memory limiting, batching, bounded queues, and finite retries. A Grafana outage can drop external telemetry after the retry window, but does not stop the API and does not disable the independent Aspire exporter.

## Protected configuration

Store these only in the GitHub `production` environment's `PRODUCTION_ENV_FILE` secret:

- `OTEL_COLLECTOR_INGEST_TOKEN`: an independently generated 32-byte-or-longer token used only by the API/worker receiver boundary.
- `GRAFANA_CLOUD_OTLP_ENDPOINT`: the stack's absolute HTTPS OTLP URL ending in `/otlp`.
- `GRAFANA_CLOUD_OTLP_INSTANCE_ID`: the numeric OTLP instance ID shown by Grafana Cloud.
- `GRAFANA_CLOUD_OTLP_API_TOKEN`: a dedicated access-policy token limited to logs, metrics, and traces write scopes.

Keep `OTEL_COLLECTOR_INGEST_TOKEN`, `ASPIRE_DASHBOARD_OTLP_API_KEY`, and the Grafana token independent. Never paste any token, derived authorization header, Collector environment dump, or rendered Compose output into logs, tickets, pull requests, or chat. Rotate a credential immediately if it is exposed.

Before deployment, run `./infra/validate-compose-env.ps1 -EnvPath <path>` and `./infra/test-otel-collector.ps1`. Deployment must remain blocked until all three Grafana values are real and the Collector configuration validates. Do not deploy placeholder values.

## Grafana Cloud verification

After an authorized deployment, generate one ordinary authenticated read request and one worker cycle. In Grafana Explore, confirm API logs, metrics, and traces; worker logs and metrics; and `deployment.environment.name=production` on both service names. The worker does not currently create a guaranteed application trace for each database-only cycle. Confirm the same emitted signals remain visible in the internal Aspire dashboard. Collector self-metrics are scraped locally into the same metrics fan-out so failed and dropped export counters can drive alerts. Do not generate failed finance writes or synthetic production sales.

## Alert definitions

Create the following rules only after live metric and log label names are verified in stack `fld614`:

| Alert | Condition | Window | Severity |
| --- | --- | --- | --- |
| API HTTP 5xx | Server request 5xx ratio is greater than 5%, with at least 20 requests | 5 minutes | Critical |
| API exceptions | At least 5 Error or Critical API log events, excluding an agreed noise allowlist | 5 minutes | Warning |
| Readiness unavailable | External HTTPS probe of `/health/ready` fails for 2 consecutive evaluations | 2 minutes | Critical |
| Collector export failure | Collector refused, failed, or dropped telemetry is non-zero | 5 minutes | Warning |

Group by production environment and service name, use a 10-minute notification grouping interval, and resolve notifications automatically. Route Critical and Warning alerts to a Telegram contact point only after the user explicitly authorizes creating the bot/token/contact point. Store the Telegram bot token in Grafana's secure contact-point field; never commit it. Send a test notification, record only the success timestamp and rule/contact-point names, then enable the notification policy.

If Grafana Cloud is unavailable, use the Aspire dashboard for immediate diagnosis. Do not restart a healthy API merely to restore the external exporter; inspect Collector health and queue/drop metrics first.
