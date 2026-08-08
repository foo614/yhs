"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";

gsap.registerPlugin(useGSAP);

const revealSelector = [
  ".premiumReveal",
  ".premiumSearchPanel",
  ".premiumBrandRail",
  ".heroVehicleStage",
  ".featuredInventorySection .sectionHeading",
  ".premiumSectionHeading",
  ".personaCard",
  ".solutionGrid article",
  ".conciergeSection > *",
  ".workshopSection > *",
  ".trustRow",
  ".testimonialPanel",
  ".filterPanel",
  ".inventoryToolbar",
  ".vehicleCard",
  ".detailGallery",
  ".detailInfo",
  ".detailPanels article",
  ".leadForm",
  ".contactCard",
  ".serviceTiles span",
  ".locationPanel > *"
].join(",");

export function MotionEnhancer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scope = useRef<HTMLDivElement>(null);

  useGSAP((_, contextSafe) => {
    const root = scope.current;
    if (!root || !contextSafe) return;
    const statElements = Array.from(root.querySelectorAll<HTMLElement>("[data-count-to]"));
    const revealElements = Array.from(root.querySelectorAll<HTMLElement>(revealSelector));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion || !("IntersectionObserver" in window)) {
      root.classList.remove("motionReady");
      statElements.forEach(setFinalStatValue);
      return;
    }

    root.classList.add("motionReady");
    revealElements.forEach((element, index) => {
      element.classList.add("motionReveal");
      element.style.setProperty("--motion-order", String(index % 6));
    });

    const reveal = contextSafe((element: HTMLElement) => {
      gsap.to(element, { autoAlpha: 1, duration: 0.78, ease: "power3.out", y: 0 });
    });
    const animateVisibleStat = contextSafe((element: HTMLElement) => animateStat(element));

    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) return;
        entry.target.classList.add("isVisible");
        reveal(entry.target);
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });

    const statObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) return;
        animateVisibleStat(entry.target);
        statObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.3 });

    revealElements.forEach((element) => revealObserver.observe(element));
    statElements.forEach((element) => statObserver.observe(element));

    return () => {
      revealObserver.disconnect();
      statObserver.disconnect();
      root.classList.remove("motionReady");
      revealElements.forEach((element) => {
        element.classList.remove("motionReveal", "isVisible");
        element.style.removeProperty("--motion-order");
      });
    };
  }, { scope, dependencies: [pathname], revertOnUpdate: true });

  return <div ref={scope}>{children}</div>;
}

function animateStat(element: HTMLElement) {
  const target = Number(element.dataset.countTo ?? "0");
  if (!Number.isFinite(target)) {
    setFinalStatValue(element);
    return;
  }

  const suffix = element.dataset.countSuffix ?? "";
  const formatter = new Intl.NumberFormat("en-US");
  const counter = { value: 0 };
  gsap.to(counter, {
    value: target,
    duration: 1.1,
    ease: "power3.out",
    onUpdate: () => {
      element.textContent = `${formatter.format(Math.round(counter.value))}${suffix}`;
    },
    onComplete: () => setFinalStatValue(element)
  });
}

function setFinalStatValue(element: HTMLElement) {
  const target = Number(element.dataset.countTo ?? "0");
  const suffix = element.dataset.countSuffix ?? "";
  if (Number.isFinite(target)) {
    element.textContent = `${new Intl.NumberFormat("en-US").format(target)}${suffix}`;
  }
}
