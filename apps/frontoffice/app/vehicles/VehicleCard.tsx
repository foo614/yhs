import Link from "next/link";
import { CalendarDays, Tag } from "lucide-react";
import { frontofficeCopy, hrefWithLanguage, type Language } from "../i18n";
import { formatThousands } from "../formatters";
import type { PublicVehicle } from "./service";
import { VehiclePhoto } from "./VehiclePhoto";

export function VehicleCard({ vehicle, featured = false, language = "en" }: { vehicle: PublicVehicle; featured?: boolean; language?: Language }) {
  const t = frontofficeCopy[language].vehicleCard;
  const detailHref = hrefWithLanguage(`/vehicles/${vehicle.id}`, language);
  const statusLabel = publicStatusLabel(vehicle.status, language);
  return (
    <article className={featured ? "vehicleCard featuredVehicleCard" : "vehicleCard"}>
      <Link href={detailHref} className="vehicleImage" aria-label={`${t.viewAria} ${vehicle.year} ${vehicle.make} ${vehicle.model}`}>
        <VehiclePhoto
          src={vehicle.photoUrl}
          alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          fallback={`${vehicle.make.slice(0, 1)}${vehicle.model.slice(0, 1)}`}
          fallbackSrc={vehicle.fallbackPhotoUrl}
        />
        <span className="stockBadge">{vehicle.stockOwner}</span>
        {vehicle.isRepresentativePhoto && (
          <span className="representativePhotoBadge">
            {vehicle.photoUrls.length > 0 ? "Representative image" : "Photo coming soon"}
          </span>
        )}
      </Link>
      <div className="vehicleBody">
        <div className="vehicleHeader">
          <div>
            <h3>{vehicle.year} {vehicle.make} {vehicle.model}</h3>
            <p className="plate">{vehicle.plateNumber}</p>
          </div>
          <div className="vehiclePrice">
            <span className="priceLabel">{t.sellingPrice}</span>
            <strong>RM {formatThousands(vehicle.sellingPrice)}</strong>
          </div>
        </div>
        <div className="specPills" aria-label="Vehicle highlights">
          <span><CalendarDays size={16} /> {vehicle.year}</span>
          <span><Tag size={16} /> {statusLabel}</span>
        </div>
        <div className="vehicleFooter">
          <Link href={detailHref} className="secondaryAction">{t.viewDetails}</Link>
        </div>
      </div>
    </article>
  );
}

function publicStatusLabel(status: PublicVehicle["status"], language: Language) {
  if (status === "Available") {
    return language === "zh" ? "\u53ef\u9884\u7ea6" : "Available";
  }

  if (status === "LoanProcessing") {
    return language === "zh" ? "\u8d37\u6b3e\u5904\u7406\u4e2d" : "Loan processing";
  }

  return language === "zh" ? "\u5df2\u552e" : "Sold";
}
