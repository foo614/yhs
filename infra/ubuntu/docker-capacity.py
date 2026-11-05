"""Sample Docker accounting locally and send numeric gauges to the internal collector."""
import http.client
import json
from pathlib import Path
import socket
import time


SERVICES = ("api", "worker", "frontoffice", "backoffice", "postgres", "caddy",
            "otel-collector", "otel-collector-health", "production-dashboard", "ops-proxy")


class DockerSocket(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(90)
        self.sock.connect("/var/run/docker.sock")


def read_docker(path):
    connection = DockerSocket("localhost")
    try:
        # Pin the flat disk-usage response used here across Engine upgrades.
        connection.request("GET", "/v1.44" + path)
        response = connection.getresponse()
        if response.status != 200:
            raise RuntimeError(f"Docker accounting returned HTTP {response.status}")
        return json.load(response)
    finally:
        connection.close()


def collect():
    timestamp = str(time.time_ns())
    points = {}

    def gauge(name, value, service=None):
        attributes = [] if service is None else [
            {"key": "compose_service", "value": {"stringValue": service}}]
        points.setdefault(name, []).append({"attributes": attributes,
            "timeUnixNano": timestamp, "asInt": str(value)})

    inventory = read_docker("/system/df")
    gauge("ysheng_docker_image_layers_bytes", inventory["LayersSize"])
    volumes = [v["UsageData"]["Size"] for v in inventory.get("Volumes") or []]
    if all(size >= 0 for size in volumes):
        gauge("ysheng_docker_volumes_bytes", sum(volumes))

    collector_ip = None
    seen = set()
    for container in inventory.get("Containers") or []:
        labels = container.get("Labels") or {}
        service = labels.get("com.docker.compose.service")
        if labels.get("com.docker.compose.project") != "ysheng" or service not in SERVICES:
            continue
        if service in seen:
            raise RuntimeError("Multiple containers for a single service")
        seen.add(service)
        details = read_docker("/containers/" + container["Id"] + "/json")
        gauge("ysheng_docker_running", int(details["State"]["Running"]), service)
        gauge("ysheng_docker_restarts", details["RestartCount"], service)
        if container.get("SizeRw", -1) >= 0:
            gauge("ysheng_docker_writable_bytes", container["SizeRw"], service)
        if details["HostConfig"]["LogConfig"]["Type"] == "json-file":
            path = Path(details["LogPath"])
            if path.parent == Path("/var/lib/docker/containers") / container["Id"]:
                files = [path, *path.parent.glob(path.name + ".[0-9]*")]
                size = 0
                for item in files:
                    try:
                        size += item.lstat().st_size
                    except FileNotFoundError:
                        pass
                gauge("ysheng_docker_log_bytes", size, service)
        if service == "otel-collector":
            networks = details["NetworkSettings"]["Networks"].values()
            collector_ip = next(n["IPAddress"] for n in networks if n.get("IPAddress"))
    for service in set(SERVICES) - seen:
        gauge("ysheng_docker_running", 0, service)
    if not collector_ip:
        raise RuntimeError("Collector unavailable")
    metrics = [{"name": name, "gauge": {"dataPoints": data}} for name, data in points.items()]
    resource = {"attributes": [{"key": "service.name",
                                "value": {"stringValue": "ysheng-docker-capacity"}}]}
    payload = {"resourceMetrics": [{"resource": resource, "scopeMetrics": [{"metrics": metrics}]}]}
    connection = http.client.HTTPConnection(collector_ip, 4318, timeout=10)
    try:
        key = "OTEL_COLLECTOR_INGEST_TOKEN="
        token = next(line[len(key):] for line in Path("/opt/ysheng/shared/.env").read_text().splitlines()
                     if line.startswith(key))
        connection.request("POST", "/v1/metrics", json.dumps(payload), {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token})
        response = connection.getresponse()
        if response.status != 200 or json.load(response).get("partialSuccess", {}).get("rejectedDataPoints", 0) not in (0, "0"):
            raise RuntimeError("Collector rejected Docker metrics")
    finally:
        connection.close()


if __name__ == "__main__":
    collect()
