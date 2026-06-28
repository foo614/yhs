"use client";

import { useState } from "react";
import { VehiclePhoto } from "../VehiclePhoto";

export function VehicleGallery({ photos, title, fallback }: { photos: string[]; title: string; fallback: string }) {
  const safePhotos = photos.filter(Boolean);
  const [selected, setSelected] = useState(0);
  const activePhoto = safePhotos[selected] ?? safePhotos[0] ?? "";

  return (
    <div className="detailGallery" aria-label={`${title} photo gallery`}>
      <div className="detailImage">
        <VehiclePhoto src={activePhoto} alt={title} fallback={fallback} />
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
              <VehiclePhoto src={photoUrl} alt={`${title} thumbnail ${index + 1}`} fallback={fallback} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
