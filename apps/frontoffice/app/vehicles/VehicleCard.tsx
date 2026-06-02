import Link from "next/link";
import { CalendarDays, Gauge, Tag } from "lucide-react";
import { frontofficeCopy, hrefWithLanguage, type Language } from "../i18n";
import type { PublicVehicle } from "./service";
import { VehiclePhoto } from "./VehiclePhoto";

export function VehicleCard({ vehicle, featured = false, language = "en" }: { vehicle: PublicVehicle; featured?: boolean; language?: Language }) {
  const t = frontofficeCopy[language].vehicleCard;
  const detailHref = hrefWithLanguage(`/vehicles/${vehicle.id}`, language);
  return (
    <article className={featured ? "vehicleCard featuredVehicleCard" : "vehicleCard"}>
      <Link href={detailHref} className="vehicleImage" aria-label={`${t.viewAria} ${vehicle.year} ${vehicle.make} ${vehicle.model}`}>
        <VehiclePhoto
          src={vehicle.photoUrl}
          alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          fallback={`${vehicle.make.slice(0, 1)}${vehicle.model.slice(0, 1)}`}
        />
        <span className="stockBadge">{vehicle.stockOwner}</span>
      </Link>
      <div className="vehicleBody">
        <div className="vehicleHeader">
          <p className="plate">{vehicle.plateNumber}</p>
          <h3>{vehicle.year} {vehicle.make} {vehicle.model}</h3>
        </div>
        <div className="specPills" aria-label="Vehicle highlights">
          <span><CalendarDays size={16} /> {vehicle.year}</span>
          <span><Gauge size={16} /> {t.readyStock}</span>
          <span><Tag size={16} /> {vehicle.status}</span>
        </div>
        <div className="vehicleFooter">
          <div>
            <span className="priceLabel">{t.sellingPrice}</span>
            <strong>RM {vehicle.sellingPrice.toLocaleString()}</strong>
          </div>
          <Link href={detailHref} className="secondaryAction">{t.viewDetails}</Link>
        </div>
      </div>
    </article>
  );
}
