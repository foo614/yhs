let pending: { id: string; bounds: DOMRect; src: string; time: number } | undefined;

export function rememberCardPhoto(id: string, card: HTMLElement | null) {
  pending = undefined;
  const frame = card?.querySelector(".vehicleImage");
  const photo = frame?.querySelector("img");
  if (!frame || !photo?.naturalWidth || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bounds = frame.getBoundingClientRect();
  if (bounds.bottom <= 0 || bounds.top >= innerHeight) return;
  pending = { id, bounds, src: photo.currentSrc, time: performance.now() };
}

export function animateCardPhoto(id: string, frame: HTMLElement) {
  const source = pending;
  pending = undefined;
  if (!source || source.id !== id || performance.now() - source.time > 3000 ||
      matchMedia("(prefers-reduced-motion: reduce)").matches || !frame.animate) return;

  const target = frame.getBoundingClientRect();
  if (!target.width || !target.height || target.top >= innerHeight || target.bottom <= 0) return;
  const photo = document.createElement("img");
  photo.alt = "";
  photo.src = source.src;
  photo.className = "arrivingVehiclePhoto";
  frame.append(photo);
  const from = source.bounds;
  const animation = frame.animate([
    { transform: `translate(${from.left - target.left}px, ${from.top - target.top}px) scale(${from.width / target.width}, ${from.height / target.height})` },
    { transform: "none" }
  ], { duration: 340, easing: "cubic-bezier(.2,.75,.25,1)" });
  animation.onfinish = () => photo.remove();
  return () => {
    animation.cancel();
    photo.remove();
  };
}
