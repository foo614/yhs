import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const adapterSource = fs.readFileSync(new URL("./nginx/ops-subpath-navigation.js", import.meta.url), "utf8");
const historyCalls = [];
const listeners = new Map();
const history = {
  pushState(...args) {
    historyCalls.push(["pushState", ...args]);
  },
  replaceState(...args) {
    historyCalls.push(["replaceState", ...args]);
  }
};
const location = {
  href: "https://yshenghub.com.my/ops/structuredlogs",
  origin: "https://yshenghub.com.my"
};
const dispatchedEvents = [];
const document = {
  addEventListener(type, listener, capture) {
    listeners.set(type, { listener, capture });
  }
};
const window = {
  dispatchEvent(event) {
    dispatchedEvents.push(event);
  },
  history,
  location
};
class PopStateEvent {
  constructor(type, init) {
    this.state = init.state;
    this.type = type;
  }
}

vm.runInNewContext(adapterSource, { PopStateEvent, URL, document, history, window });

for (const [route, expected] of [
  ["/", "/ops/"],
  ["/resources/api", "/ops/resources/api"],
  ["/consolelogs/api", "/ops/consolelogs/api"],
  ["/structuredlogs", "/ops/structuredlogs"],
  ["/traces/detail/trace-id?spanId=span-id#waterfall", "/ops/traces/detail/trace-id?spanId=span-id#waterfall"],
  ["/metrics", "/ops/metrics"]
]) {
  history.pushState(null, "", route);
  assert.equal(historyCalls.at(-1)[3], expected);
}

history.pushState(null, "", "/ops/metrics");
assert.equal(historyCalls.at(-1)[3], "/ops/metrics");

history.pushState(null, "", "/api/auth/me");
assert.equal(historyCalls.at(-1)[3], "/api/auth/me");

history.replaceState(null, "", "/dashboard");
assert.equal(historyCalls.at(-1)[3], "/dashboard");

history.pushState(null, "", "https://example.com/traces");
assert.equal(historyCalls.at(-1)[3], "https://example.com/traces");

const traceAnchor = {
  href: "/traces/detail/trace-id",
  target: "",
  getAttribute(name) {
    return name === "href" ? this.href : null;
  },
  hasAttribute() {
    return false;
  },
  setAttribute(name, value) {
    if (name === "href") {
      this.href = value;
    }
  }
};
const clickRegistration = listeners.get("click");
assert.equal(clickRegistration.capture, true);
let clickPrevented = false;
let clickStopped = false;
clickRegistration.listener({
  altKey: false,
  button: 0,
  ctrlKey: false,
  defaultPrevented: false,
  metaKey: false,
  preventDefault() {
    clickPrevented = true;
  },
  shiftKey: false,
  stopImmediatePropagation() {
    clickStopped = true;
  },
  target: { closest: () => traceAnchor }
});
assert.equal(traceAnchor.href, "/ops/traces/detail/trace-id");
assert.equal(clickPrevented, true);
assert.equal(clickStopped, true);
assert.equal(historyCalls.at(-1)[3], "/ops/traces/detail/trace-id");
assert.equal(dispatchedEvents.at(-1).type, "popstate");
assert.equal(dispatchedEvents.at(-1).state, null);

console.log("Aspire /ops subpath navigation adapter tests passed.");
