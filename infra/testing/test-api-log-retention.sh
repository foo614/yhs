#!/usr/bin/env bash
# Run only on an isolated CI runner with systemd and Docker.
set -euo pipefail
namespace="ysheng-ci-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
unit="systemd-journald@$namespace"
socket="/run/systemd/journal.$namespace/dev-log"
sudo install -D -m 0644 infra/ubuntu/ysheng-api-journal.conf "/etc/systemd/journald@$namespace.conf.d/retention.conf"
sudo systemctl add-wants sockets.target "$unit.socket"
sudo systemctl start "$unit.socket"
test -S "$socket"
for mark in before-recreation after-recreation; do
  docker run --rm --name "$namespace" --log-driver syslog \
    --log-opt "syslog-address=unixgram://$socket" --log-opt tag=ysheng-api \
    --log-opt cache-disabled=true alpine:3.22 echo "$mark"
done
sudo journalctl --namespace="$namespace" --sync
messages="$(sudo journalctl --namespace="$namespace" -t ysheng-api -o cat --no-pager)"
grep -Fxq before-recreation <<< "$messages"
grep -Fxq after-recreation <<< "$messages"
test -d "/var/log/journal/$(cat /etc/machine-id).$namespace"
