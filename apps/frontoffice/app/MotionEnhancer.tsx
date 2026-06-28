"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const revealSelector = [
  ".premiumReveal",
  ".premiumSearchPanel",
  ".premiumBrandRail",
  ".heroVehicleStage",
  ".premiumSectionHeading",
  ".personaCard",
  ".solutionGrid article",
  ".conciergeSection > *",
  ".workshopSection > *",
  ".trustRow",
  ".testimonialPanel",
  ".listingShell",
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

export function MotionEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const statElements = Array.from(document.querySelectorAll<HTMLElement>("[data-count-to]"));

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      root.classList.remove("motionReady");
      statElements.forEach(setFinalStatValue);
      return;
    }

    root.classList.add("motionReady");
    const elements = Array.from(document.querySelectorAll<HTMLElement>(revealSelector));
    const animationFrames = new Set<number>();

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("isVisible");
          observer.unobserve(entry.target);
        }
      }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });

    const statObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target instanceof HTMLElement) {
          animateStat(entry.target, animationFrames);
          statObserver.unobserve(entry.target);
        }
      }
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.3 });

    const frame = window.requestAnimationFrame(() => {
      elements.forEach((element, index) => {
        element.classList.add("motionReveal");
        element.style.setProperty("--motion-order", String(index % 6));
        observer.observe(element);
      });
      statElements.forEach((element) => statObserver.observe(element));
    });

    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const spotlightTarget = document.querySelector<HTMLElement>(".premiumHome") ?? root;
    const onPointerMove = (event: PointerEvent) => {
      spotlightTarget.style.setProperty("--spotlight-x", `${event.clientX}px`);
      spotlightTarget.style.setProperty("--spotlight-y", `${event.clientY}px`);
    };

    if (finePointer) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    return () => {
      window.cancelAnimationFrame(frame);
      animationFrames.forEach((animationFrame) => window.cancelAnimationFrame(animationFrame));
      observer.disconnect();
      statObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [pathname]);

  return null;
}

function animateStat(element: HTMLElement, animationFrames: Set<number>) {
  const target = Number(element.dataset.countTo ?? "0");
  if (!Number.isFinite(target)) {
    setFinalStatValue(element);
    return;
  }

  const suffix = element.dataset.countSuffix ?? "";
  const formatter = new Intl.NumberFormat("en-US");
  const duration = 1100;
  const startTime = performance.now();

  const tick = (now: number) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = `${formatter.format(Math.round(target * eased))}${suffix}`;
    if (progress < 1) {
      const frame = window.requestAnimationFrame(tick);
      animationFrames.add(frame);
    } else {
      setFinalStatValue(element);
    }
  };

  const frame = window.requestAnimationFrame(tick);
  animationFrames.add(frame);
}

function setFinalStatValue(element: HTMLElement) {
  const target = Number(element.dataset.countTo ?? "0");
  const suffix = element.dataset.countSuffix ?? "";
  if (!Number.isFinite(target)) {
    return;
  }
  element.textContent = `${new Intl.NumberFormat("en-US").format(target)}${suffix}`;
}
