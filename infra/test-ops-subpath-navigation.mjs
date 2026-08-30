import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const adapterSource = fs.readFileSync(new URL("./nginx/ops-subpath-navigation.js", import.meta.url), "utf8");
const historyCalls = [];
const listeners = new Map();
const mutationObservers = [];
const assignedLocations = [];
const history = {
  pushState(...args) {
    historyCalls.push(["pushState", ...args]);
  },
  replaceState(...args) {
    historyCalls.push(["replaceState", ...args]);
  }
};
const location = {
  href: "https://yshenghub.com.my/traces/detail/initial-trace?spanId=initial-span",
  origin: "https://yshenghub.com.my",
  assign(value) {
    assignedLocations.push(value);
  }
};
const dispatchedEvents = [];
const document = {
  documentElement: {},
  querySelectorAll() {
    return [];
  }
};
const window = {
  addEventListener(type, listener, capture) {
    listeners.set(type, { listener, capture });
  },
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
class MutationObserver {
  constructor(callback) {
    this.callback = callback;
    mutationObservers.push(this);
  }

  observe(target, options) {
    this.target = target;
    this.options = options;
  }
}

vm.runInNewContext(adapterSource, { MutationObserver, PopStateEvent, URL, document, history, window });
assert.deepEqual(historyCalls[0], ["replaceState", null, "", "/ops/traces/detail/initial-trace?spanId=initial-span"]);

const blazorNavigationCalls = [];
window.Blazor = {
  navigateTo(...args) {
    blazorNavigationCalls.push(["public", ...args]);
  },
  _internal: {
    navigationManager: {
      navigateTo(...args) {
        blazorNavigationCalls.push(["internal", ...args]);
      }
    }
  }
};
window.Blazor.navigateTo("/metrics/resource/api?view=Graph", { replaceHistoryEntry: true });
window.Blazor._internal.navigationManager.navigateTo("/traces/detail/trace-id", { forceLoad: false });
window.Blazor.navigateTo("/api/auth/me", false);
window.Blazor._internal.navigationManager.navigateTo("https://example.com/metrics", true);
assert.deepEqual(blazorNavigationCalls, [
  ["public", "/ops/metrics/resource/api?view=Graph", { replaceHistoryEntry: true }],
  ["internal", "/ops/traces/detail/trace-id", { forceLoad: false }],
  ["public", "/api/auth/me", false],
  ["internal", "https://example.com/metrics", true]
]);

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
assert.equal(mutationObservers.length, 1);
assert.equal(mutationObservers[0].target, document.documentElement);
assert.equal(mutationObservers[0].options.attributes, true);
assert.equal(mutationObservers[0].options.childList, true);
assert.equal(mutationObservers[0].options.subtree, true);
mutationObservers[0].callback([{
  addedNodes: [{
    matches: () => true,
    getAttribute: traceAnchor.getAttribute.bind(traceAnchor),
    setAttribute: traceAnchor.setAttribute.bind(traceAnchor)
  }],
  type: "childList"
}]);
assert.equal(traceAnchor.href, "/ops/traces/detail/trace-id");
traceAnchor.href = "/metrics";

const clickRegistration = listeners.get("click");
assert.equal(clickRegistration.capture, true);
let clickPrevented = false;
let clickStopped = false;
const clickNavigationCallCount = blazorNavigationCalls.length;
const clickHistoryCallCount = historyCalls.length;
const clickEventCount = dispatchedEvents.length;
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
assert.equal(traceAnchor.href, "/ops/metrics");
assert.equal(clickPrevented, true);
assert.equal(clickStopped, true);
assert.deepEqual(blazorNavigationCalls.slice(clickNavigationCallCount), [
  ["public", "/ops/metrics"]
]);
assert.equal(historyCalls.length, clickHistoryCallCount);
assert.equal(dispatchedEvents.length, clickEventCount);

const modifiedClickNavigationCallCount = blazorNavigationCalls.length;
clickRegistration.listener({
  altKey: false,
  button: 0,
  ctrlKey: true,
  defaultPrevented: false,
  metaKey: false,
  preventDefault() {},
  shiftKey: false,
  stopImmediatePropagation() {},
  target: { closest: () => traceAnchor }
});
assert.equal(blazorNavigationCalls.length, modifiedClickNavigationCallCount);
assert.equal(historyCalls.length, clickHistoryCallCount);
assert.equal(dispatchedEvents.length, clickEventCount);

window.Blazor = undefined;
traceAnchor.href = "/structuredlogs";
clickPrevented = false;
clickStopped = false;
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
assert.equal(clickPrevented, true);
assert.equal(clickStopped, true);
assert.deepEqual(assignedLocations, ["/ops/structuredlogs"]);
assert.equal(historyCalls.length, clickHistoryCallCount);
assert.equal(dispatchedEvents.length, clickEventCount);

console.log("Aspire /ops subpath navigation adapter tests passed.");
