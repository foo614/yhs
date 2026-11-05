import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("capacity", Path(__file__).resolve().parents[1] / "ubuntu/docker-capacity.py")
capacity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capacity)


class CapacityTest(unittest.TestCase):
    def test_only_fixed_service_labels_and_numeric_sizes_leave_host(self):
        inventory = {"LayersSize": 700, "Volumes": [{"UsageData": {"Size": 50}}],
                     "Containers": [{"Labels": {}, "Id": "unrelated"},
                         {"Id": "c1", "SizeRw": 24, "Labels": {
                             "com.docker.compose.project": "ysheng",
                             "com.docker.compose.service": "otel-collector"}}]}
        inspect = {"State": {"Running": True}, "RestartCount": 3,
                   "HostConfig": {"LogConfig": {"Type": "json-file"}},
                   "LogPath": "/var/lib/docker/containers/c1/c1-json.log",
                   "NetworkSettings": {"Networks": {"internal": {"IPAddress": "127.0.0.1"}}},
                   "Config": {"Env": ["private-test-marker"]}}
        with patch.object(capacity, "read_docker", side_effect=[inventory, inspect]), \
             patch.object(Path, "glob", return_value=[]), \
             patch.object(Path, "lstat") as log_stat, \
             patch.object(Path, "read_text", return_value="OTEL_COLLECTOR_INGEST_TOKEN=test"), \
             patch.object(capacity.http.client, "HTTPConnection") as conn:
            log_stat.return_value.st_size = 17
            response = conn.return_value.getresponse.return_value
            response.status = 200
            response.read.return_value = b"{}"
            capacity.collect()
            body = conn.return_value.request.call_args.args[2]
        self.assertNotIn("private-test-marker", body)
        self.assertNotIn("c1-json", body)
        metrics = json.loads(body)["resourceMetrics"][0]["scopeMetrics"][0]["metrics"]
        points = {m["name"]: m["gauge"]["dataPoints"] for m in metrics}
        self.assertEqual(points["ysheng_docker_image_layers_bytes"][0]["asInt"], "700")
        self.assertEqual(points["ysheng_docker_volumes_bytes"][0]["asInt"], "50")
        self.assertEqual(points["ysheng_docker_writable_bytes"][0]["asInt"], "24")
        self.assertEqual(points["ysheng_docker_log_bytes"][0]["asInt"], "17")
        self.assertEqual(len(points["ysheng_docker_running"]), len(capacity.SERVICES))


if __name__ == "__main__":
    unittest.main()
