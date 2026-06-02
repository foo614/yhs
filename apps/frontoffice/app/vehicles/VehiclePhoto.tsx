"use client";

import { useState } from "react";

export function VehiclePhoto({ src, alt, fallback }: { src: string; alt: string; fallback: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <>
      {!failed && <img src={src} alt={alt} onError={() => setFailed(true)} />}
      <span className={failed ? "isVisibleFallback" : undefined}>{fallback}</span>
    </>
  );
}
