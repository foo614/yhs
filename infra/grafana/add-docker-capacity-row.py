"""Render an updated Grafana v2 on-call dashboard export to stdout."""
import copy
import json
import sys


def add_row(dashboard):
    if dashboard["metadata"]["name"] != "ysheng-production-oncall-overview":
        raise ValueError("Expected the production on-call overview")
    spec = dashboard["spec"]
    elements = spec["elements"]
    templates = {v["spec"]["title"]: v for v in elements.values()}
    table = templates["Slowest API routes · P95"]
    stat = templates["Root disk used · %"]
    rows = spec["layout"]["spec"]["rows"]
    if any(r["spec"]["title"] == "Docker containers" for r in rows):
        raise ValueError("Docker containers section already exists")
    next_id = max(v["spec"]["id"] for v in elements.values()) + 1
    items = []
    selector = '{service_name="ysheng-docker-capacity",deployment_environment_name=~"$environment"}'

    def metric(suffix):
        return "last_over_time(ysheng_docker_" + suffix + selector + "[10m])"

    def panel(template, title, exprs, x, y, width, height):
        nonlocal next_id
        obj = copy.deepcopy(template)
        p = obj["spec"]
        p.update(id=next_id, title=title, description="Samples every five minutes. Samples older than ten minutes are omitted.", links=[])
        data = p["data"]["spec"]
        queries = []
        for i, expr in enumerate(exprs):
            q = copy.deepcopy(stat["spec"]["data"]["spec"]["queries"][0])
            q["spec"]["refId"] = chr(65 + i)
            q["spec"]["query"]["spec"].update(expr=expr, format="table" if template is table else "time_series", instant=True, range=False)
            queries.append(q)
        data.update(queries=queries, transformations=[])
        viz = p["vizConfig"]["spec"]
        viz["fieldConfig"] = {"defaults": {}, "overrides": []}
        key = "panel-" + str(next_id)
        elements[key] = obj
        next_id += 1
        items.append({"kind": "GridLayoutItem", "spec": {"element": {"kind": "ElementReference", "name": key},
                      "x": x, "y": y, "width": width, "height": height}})
        return data, viz

    names = ["Running (1/0)", "Restarts", "Writable bytes", "Log bytes", "Log + writable"]
    exprs = ["max by (compose_service) (" + metric(s) + ")" for s in ("running", "restarts", "writable_bytes", "log_bytes")]
    data, viz = panel(table, "Docker services · storage and state", exprs + [exprs[2] + " + " + exprs[3]], 0, 0, 24, 9)
    def transform(kind, options):
        return {"kind": kind, "spec": {"id": kind, "options": options}}
    rename = {"Value #" + chr(65+i): n for i, n in enumerate(names)}
    rename["compose_service"] = "Service"
    data["transformations"] = [transform("joinByField", {"byField": "compose_service", "mode": "outerTabular"}),
        transform("filterFieldsByName", {"include": {"names": list(rename)}}),
        transform("organize", {"renameByName": rename})]
    viz["options"]["sortBy"] = [{"displayName": names[-1], "desc": True}]
    for name in names[2:]:
        viz["fieldConfig"]["overrides"].append({"matcher": {"id": "byName", "options": name},
            "properties": [{"id": "unit", "value": "bytes"}]})
    for i, (title, suffix) in enumerate([("Docker image layers · whole host", "image_layers_bytes"),
                                         ("Docker volumes · whole host", "volumes_bytes")]):
        _, v = panel(stat, title, ["max(" + metric(suffix) + ")"], i*12, 9, 12, 4)
        v["fieldConfig"]["defaults"] = {"unit": "bytes", "noValue": "Unknown"}
        v["options"].update(colorMode="none", graphMode="none")
    rows.insert(1, {"kind": "RowsLayoutRow", "spec": {"title": "Docker containers", "collapse": True,
                "hideHeader": False, "layout": {"kind": "GridLayout", "spec": {"items": items}}}})
    return dashboard


if __name__ == "__main__":
    json.dump(add_row(json.load(sys.stdin)), sys.stdout)
