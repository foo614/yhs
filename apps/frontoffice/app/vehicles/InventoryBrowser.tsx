"use client";

import { CloudOff, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { frontofficeCopy, hrefWithLanguage, type Language } from "../i18n";
import { filterAndSortVehicles, type ListingFilters, type ListingSort } from "./listing";
import type { PublicVehicle } from "./service";
import { VehicleCard } from "./VehicleCard";

const INITIAL_VISIBLE_COUNT = 24;
const VISIBLE_COUNT_INCREMENT = 12;

export function InventoryBrowser({ vehicles, initialFilters = {}, language = "en", unavailable = false }: { vehicles: PublicVehicle[]; initialFilters?: ListingFilters; language?: Language; unavailable?: boolean }) {
  const t = frontofficeCopy[language].inventory;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(initialFilters.query ?? "");
  const [minYear, setMinYear] = useState(initialFilters.minYear ? String(initialFilters.minYear) : "");
  const [maxYear, setMaxYear] = useState(initialFilters.maxYear ? String(initialFilters.maxYear) : "");
  const [minPrice, setMinPrice] = useState(initialFilters.minPrice ? String(initialFilters.minPrice) : "");
  const [maxPrice, setMaxPrice] = useState(initialFilters.maxPrice ? String(initialFilters.maxPrice) : "");
  const [make, setMake] = useState(initialFilters.make ?? "");
  const [stockOwner, setStockOwner] = useState<PublicVehicle["stockOwner"] | "All">(initialFilters.stockOwner ?? "All");
  const [sort, setSort] = useState<ListingSort>(initialFilters.sort ?? "year-desc");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const makes = useMemo(() => [...new Set(vehicles.map((vehicle) => vehicle.make).filter(Boolean))].sort((left, right) => left.localeCompare(right)), [vehicles]);

  useEffect(() => {
    setQuery(initialFilters.query ?? "");
    setMake(initialFilters.make ?? "");
    setMinYear(initialFilters.minYear ? String(initialFilters.minYear) : "");
    setMaxYear(initialFilters.maxYear ? String(initialFilters.maxYear) : "");
    setMinPrice(initialFilters.minPrice ? String(initialFilters.minPrice) : "");
    setMaxPrice(initialFilters.maxPrice ? String(initialFilters.maxPrice) : "");
    setStockOwner(initialFilters.stockOwner ?? "All");
    setSort(initialFilters.sort ?? "year-desc");
  }, [
    initialFilters.make,
    initialFilters.maxPrice,
    initialFilters.maxYear,
    initialFilters.minPrice,
    initialFilters.minYear,
    initialFilters.query,
    initialFilters.sort,
    initialFilters.stockOwner
  ]);

  const filteredVehicles = useMemo(() => filterAndSortVehicles(vehicles, {
    query,
    make,
    minYear: toNumber(minYear),
    maxYear: toNumber(maxYear),
    minPrice: toNumber(minPrice),
    maxPrice: toNumber(maxPrice),
    stockOwner,
    sort
  }), [make, maxPrice, maxYear, minPrice, minYear, query, sort, stockOwner, vehicles]);
  const visibleVehicles = useMemo(() => filteredVehicles.slice(0, visibleCount), [filteredVehicles, visibleCount]);
  const hasMoreVehicles = visibleCount < filteredVehicles.length;

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [make, maxPrice, maxYear, minPrice, minYear, query, sort, stockOwner, vehicles]);

  useEffect(() => {
    const marker = loadMoreRef.current;
    if (!hasMoreVehicles || !marker || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisibleCount((current) => Math.min(current + VISIBLE_COUNT_INCREMENT, filteredVehicles.length));
    }, { rootMargin: "420px 0px" });

    observer.observe(marker);
    return () => observer.disconnect();
  }, [filteredVehicles.length, hasMoreVehicles]);

  return (
    <section className="listingShell" aria-label={t.kicker}>
      <aside className="filterPanel">
        <div className="filterTitle">
          <SlidersHorizontal size={20} />
          <div>
            <h2>{t.filterTitle}</h2>
            <p>{filteredVehicles.length} {t.countOf} {vehicles.length} {t.vehicles}</p>
          </div>
        </div>
        <label>
          {t.search}
          <span className="inputIcon">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} />
          </span>
        </label>
        <label>
          {t.make}
          <select value={make} onChange={(event) => setMake(event.target.value)}>
            <option value="">{t.anyMake}</option>
            {makes.map((entry) => <option value={entry} key={entry}>{entry}</option>)}
          </select>
        </label>
        <label>
          {t.yearFrom}
          <input value={minYear} onChange={(event) => setMinYear(event.target.value)} inputMode="numeric" placeholder="2020" />
        </label>
        <label>
          {t.yearTo}
          <input value={maxYear} onChange={(event) => setMaxYear(event.target.value)} inputMode="numeric" placeholder="2024" />
        </label>
        <label>
          {t.priceFrom}
          <input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} inputMode="numeric" placeholder="30000" />
        </label>
        <label>
          {t.priceTo}
          <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} inputMode="numeric" placeholder="60000" />
        </label>
        <label>
          {t.stockOwner}
          <select value={stockOwner} onChange={(event) => setStockOwner(event.target.value as PublicVehicle["stockOwner"] | "All")}>
            <option value="All">{t.allStock}</option>
            <option value="YSHeng">YS Heng</option>
            <option value="KS">KS</option>
          </select>
        </label>
        <label>
          {t.sort}
          <select value={sort} onChange={(event) => setSort(event.target.value as ListingSort)}>
            <option value="year-desc">{t.newestFirst}</option>
            <option value="price-asc">{t.priceLow}</option>
            <option value="price-desc">{t.priceHigh}</option>
          </select>
        </label>
      </aside>

      <div className="listingContent">
        <div className="inventoryToolbar">
          <div>
            <p className="atelierKicker">{t.kicker}</p>
            <h2>{filteredVehicles.length} {t.vehicles}</h2>
          </div>
          <div className="inventoryChips" aria-label="Active inventory filters">
            {make && <span>{make}</span>}
            <span>{stockOwner === "All" ? t.allStock : stockOwner}</span>
            <span>{sort === "year-desc" ? t.newestFirst : sort === "price-asc" ? t.priceLow : t.priceHigh}</span>
          </div>
        </div>

        <div className="listingResults rednoteFeed">
          {unavailable ? (
            <div className="emptyState inventoryUnavailable">
              <CloudOff size={32} aria-hidden="true" />
              <h3>{t.unavailableTitle}</h3>
              <p>{t.unavailableText}</p>
              <a href={hrefWithLanguage("/contact", language)} className="secondaryAction">{t.contactSales}</a>
            </div>
          ) : filteredVehicles.length > 0 ? (
            visibleVehicles.map((vehicle) => <VehicleCard vehicle={vehicle} language={language} key={vehicle.id} />)
          ) : (
            <div className="emptyState">
              <h3>{t.emptyTitle}</h3>
              <p>{t.emptyText}</p>
            </div>
          )}
        </div>
        {filteredVehicles.length > 0 && (
          <div className="inventoryLoadMore" ref={loadMoreRef}>
            <p>
              {t.showingVehicles
                .replace("{visible}", String(visibleVehicles.length))
                .replace("{total}", String(filteredVehicles.length))}
            </p>
            {hasMoreVehicles ? (
              <button
                className="secondaryAction loadMoreButton"
                type="button"
                onClick={() => setVisibleCount((current) => Math.min(current + VISIBLE_COUNT_INCREMENT, filteredVehicles.length))}
              >
                {t.loadMore}
              </button>
            ) : (
              <span>{t.allLoaded}</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
