"use client";

import { useEffect, useState } from "react";
import { VehiclePhoto } from "../VehiclePhoto";

export function VehicleGallery({ photos, title, fallback, fallbackSrc }: { photos: string[]; title: string; fallback: string; fallbackSrc?: string }) {
  const safePhotos = [...new Set(photos.filter(Boolean))];
  const [selected, setSelected] = useState(0);
  const activePhoto = safePhotos[selected] ?? safePhotos[0] ?? "";

  useEffect(() => {
    if (selected >= safePhotos.length) {
      setSelected(0);
    }
  }, [safePhotos.length, selected]);

  return (
    <div className="detailGallery" aria-label={`${title} photo gallery`}>
      <div className="detailImage">
        <VehiclePhoto src={activePhoto} alt={title} fallback={fallback} fallbackSrc={fallbackSrc} />
      </div>
      {safePhotos.length > 1 && (
        <div className="detailPhotoStrip" aria-label="Select vehicle photo">
          {safePhotos.map((photoUrl, index) => (
            <button
              type="button"
              className={index === selected ? "isPrimary" : ""}
              aria-label={`Show ${title} photo ${index + 1}`}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
              key={`${photoUrl}-${index}`}
            >
              <VehiclePhoto src={photoUrl} alt={`${title} thumbnail ${index + 1}`} fallback={fallback} fallbackSrc={fallbackSrc} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
