"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function VehiclePhoto({ src, alt, fallback, fallbackSrc }: { src: string; alt: string; fallback: string; fallbackSrc?: string }) {
  const [failed, setFailed] = useState(false);
  const [activeSrc, setActiveSrc] = useState(src);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setFailed(false);
    setActiveSrc(src || fallbackSrc || "");
  }, [fallbackSrc, src]);

  const handleImageError = useCallback(() => {
    if (fallbackSrc && activeSrc !== fallbackSrc) {
      setActiveSrc(fallbackSrc);
      return;
    }

    setFailed(true);
  }, [activeSrc, fallbackSrc]);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) {
      handleImageError();
    }
  }, [activeSrc, handleImageError]);

  const showImage = Boolean(activeSrc) && !failed;

  return (
    <>
      {showImage && <img ref={imageRef} src={activeSrc} alt={alt} onError={handleImageError} />}
      {!showImage && <span className="isVisibleFallback">{fallback}</span>}
    </>
  );
}
