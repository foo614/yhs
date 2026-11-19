"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animateCardPhoto } from "../photo-transition";
import { frontofficeCopy, type Language } from "../../i18n";
import { VehiclePhoto } from "../VehiclePhoto";

export function VehicleGallery({
  vehicleId,
  photos,
  title,
  fallback,
  fallbackSrc,
  language = "en"
}: {
  vehicleId: string;
  photos: string[];
  title: string;
  fallback: string;
  fallbackSrc?: string;
  language?: Language;
}) {
  const frame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let cleanup: (() => void) | undefined;
    const tick = requestAnimationFrame(() => {
      if (frame.current) cleanup = animateCardPhoto(vehicleId, frame.current);
    });
    return () => {
      cancelAnimationFrame(tick);
      cleanup?.();
    };
  }, [vehicleId]);
  const t = frontofficeCopy[language].detail.gallery;
  const safePhotos = [...new Set(photos.filter(Boolean))];
  const [selected, setSelected] = useState(0);
  const activePhoto = safePhotos[selected] ?? safePhotos[0] ?? "";

  useEffect(() => {
    if (selected >= safePhotos.length) {
      setSelected(0);
    }
  }, [safePhotos.length, selected]);

  return (
    <div className="detailGallery" aria-label={t.galleryAria.replace("{title}", title)}>
      <div ref={frame} className="detailImage">
        <VehiclePhoto src={activePhoto} alt={title} fallback={fallback} fallbackSrc={fallbackSrc} />
      </div>
      {safePhotos.length > 1 && (
        <div className="detailPhotoStrip" aria-label={t.selectAria}>
          {safePhotos.map((photoUrl, index) => (
            <button
              type="button"
              className={index === selected ? "isPrimary" : ""}
              aria-label={t.showPhotoAria.replace("{title}", title).replace("{index}", String(index + 1))}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
              key={`${photoUrl}-${index}`}
            >
              <VehiclePhoto
                src={photoUrl}
                alt={t.thumbnailAlt.replace("{title}", title).replace("{index}", String(index + 1))}
                fallback={fallback}
                fallbackSrc={fallbackSrc}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
