(() => {
  "use strict";

  const opsBasePath = "/ops";
  const dashboardRouteRoots = [
    "/resources",
    "/consolelogs",
    "/structuredlogs",
    "/traces",
    "/metrics"
  ];

  function isDashboardPath(pathname) {
    return pathname === "/" || dashboardRouteRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
  }

  function rebaseDashboardUrl(value) {
    if (value === null || value === undefined) {
      return value;
    }

    const originalValue = String(value);
    let url;
    try {
      url = new URL(originalValue, window.location.href);
    } catch {
      return value;
    }

    if (url.origin !== window.location.origin || url.pathname === opsBasePath || url.pathname.startsWith(`${opsBasePath}/`) || !isDashboardPath(url.pathname)) {
      return value;
    }

    return `${opsBasePath}${url.pathname}${url.search}${url.hash}`;
  }

  function isOpsDashboardUrl(value) {
    let url;
    try {
      url = new URL(String(value), window.location.href);
    } catch {
      return false;
    }

    if (url.origin !== window.location.origin || (url.pathname !== opsBasePath && !url.pathname.startsWith(`${opsBasePath}/`))) {
      return false;
    }

    const dashboardPath = url.pathname === opsBasePath ? "/" : url.pathname.slice(opsBasePath.length);
    return isDashboardPath(dashboardPath);
  }

  function rebaseAnchor(anchor) {
    const originalHref = anchor.getAttribute?.("href");
    const rebasedHref = rebaseDashboardUrl(originalHref);
    if (rebasedHref !== originalHref) {
      anchor.setAttribute("href", rebasedHref);
    }
  }

  function rebaseAnchors(root) {
    if (root.matches?.("a[href]")) {
      rebaseAnchor(root);
    }

    root.querySelectorAll?.("a[href]").forEach(rebaseAnchor);
  }

  for (const methodName of ["pushState", "replaceState"]) {
    const originalMethod = window.history[methodName].bind(window.history);
    window.history[methodName] = (state, unused, url) => originalMethod(state, unused, rebaseDashboardUrl(url));
  }

  const rebasedLocation = rebaseDashboardUrl(window.location.href);
  if (rebasedLocation !== window.location.href) {
    window.history.replaceState(null, "", rebasedLocation);
  }

  rebaseAnchors(document);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        rebaseAnchor(mutation.target);
        continue;
      }

      for (const addedNode of mutation.addedNodes) {
        rebaseAnchors(addedNode);
      }
    }
  }).observe(document.documentElement, {
    attributeFilter: ["href"],
    attributes: true,
    childList: true,
    subtree: true
  });

  window.addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const anchor = event.target.closest?.("a[href]");
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) {
      return;
    }

    const originalHref = anchor.getAttribute("href");
    const rebasedHref = rebaseDashboardUrl(originalHref);
    if (isOpsDashboardUrl(rebasedHref)) {
      anchor.setAttribute("href", rebasedHref);
      event.preventDefault();
      event.stopImmediatePropagation();
      window.history.pushState(null, "", rebasedHref);
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    }
  }, true);
})();
