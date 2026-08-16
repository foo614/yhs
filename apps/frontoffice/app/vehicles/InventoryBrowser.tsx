"use client";

import { CircleAlert, CloudOff, RotateCcw, Search, SearchX, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { frontofficeCopy, hrefWithLanguage, type Language } from "../i18n";
import {
  filterAndSortVehicles,
  validateListingFilterInputs,
  type ListingFilters,
  type ListingFilterValidationError,
  type ListingSort
} from "./listing";
import type { PublicVehicle } from "./service";
import { VehicleCard } from "./VehicleCard";

const INITIAL_VISIBLE_COUNT = 24;
const VISIBLE_COUNT_INCREMENT = 12;

export function InventoryBrowser({ vehicles, initialFilters = {}, language = "en", unavailable = false }: { vehicles: PublicVehicle[]; initialFilters?: ListingFilters; language?: Language; unavailable?: boolean }) {
  const t = frontofficeCopy[language].inventory;
  const router = useRouter();
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
  const latestModelYear = new Date().getFullYear() + 1;

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

  const numericValidation = useMemo(() => validateListingFilterInputs({ minYear, maxYear, minPrice, maxPrice }, latestModelYear), [latestModelYear, maxPrice, maxYear, minPrice, minYear]);
  const filteredVehicles = useMemo(() => filterAndSortVehicles(vehicles, {
    query,
    make,
    ...numericValidation.filters,
    stockOwner,
    sort
  }), [make, numericValidation.filters, query, sort, stockOwner, vehicles]);
  const visibleVehicles = useMemo(() => filteredVehicles.slice(0, visibleCount), [filteredVehicles, visibleCount]);
  const hasMoreVehicles = visibleCount < filteredVehicles.length;
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (query.trim()) labels.push(`${t.search}: ${query.trim()}`);
    if (make) labels.push(make);
    if (numericValidation.filters.minYear !== undefined) labels.push(`${t.yearFrom} ${numericValidation.filters.minYear}`);
    if (numericValidation.filters.maxYear !== undefined) labels.push(`${t.yearTo} ${numericValidation.filters.maxYear}`);
    if (numericValidation.filters.minPrice !== undefined) labels.push(`${t.priceFrom} RM ${numericValidation.filters.minPrice.toLocaleString()}`);
    if (numericValidation.filters.maxPrice !== undefined) labels.push(`${t.priceTo} RM ${numericValidation.filters.maxPrice.toLocaleString()}`);
    if (stockOwner !== "All") labels.push(stockOwner);
    return labels;
  }, [make, numericValidation.filters, query, stockOwner, t]);
  const noVehiclesAvailable = vehicles.length === 0 && activeFilterLabels.length === 0;

  function clearFilters() {
    setQuery("");
    setMake("");
    setMinYear("");
    setMaxYear("");
    setMinPrice("");
    setMaxPrice("");
    setStockOwner("All");
    setSort("year-desc");
    router.replace(hrefWithLanguage("/vehicles", language), { scroll: false });
  }

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
        <div className="filterField">
          <label>
            {t.yearFrom}
            <input
              value={minYear}
              onChange={(event) => setMinYear(event.target.value)}
              inputMode="numeric"
              maxLength={4}
              placeholder="2020"
              aria-invalid={Boolean(numericValidation.errors.minYear)}
              aria-describedby={numericValidation.errors.minYear ? "min-year-error" : undefined}
            />
          </label>
          {numericValidation.errors.minYear && <FilterValidationMessage id="min-year-error" error={numericValidation.errors.minYear} t={t} />}
        </div>
        <div className="filterField">
          <label>
            {t.yearTo}
            <input
              value={maxYear}
              onChange={(event) => setMaxYear(event.target.value)}
              inputMode="numeric"
              maxLength={4}
              placeholder="2024"
              aria-invalid={Boolean(numericValidation.errors.maxYear)}
              aria-describedby={numericValidation.errors.maxYear ? "max-year-error" : undefined}
            />
          </label>
          {numericValidation.errors.maxYear && <FilterValidationMessage id="max-year-error" error={numericValidation.errors.maxYear} t={t} />}
        </div>
        <div className="filterField">
          <label>
            {t.priceFrom}
            <input
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              inputMode="numeric"
              placeholder="30000"
              aria-invalid={Boolean(numericValidation.errors.minPrice)}
              aria-describedby={numericValidation.errors.minPrice ? "min-price-error" : undefined}
            />
          </label>
          {numericValidation.errors.minPrice && <FilterValidationMessage id="min-price-error" error={numericValidation.errors.minPrice} t={t} />}
        </div>
        <div className="filterField">
          <label>
            {t.priceTo}
            <input
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              inputMode="numeric"
              placeholder="60000"
              aria-invalid={Boolean(numericValidation.errors.maxPrice)}
              aria-describedby={numericValidation.errors.maxPrice ? "max-price-error" : undefined}
            />
          </label>
          {numericValidation.errors.maxPrice && <FilterValidationMessage id="max-price-error" error={numericValidation.errors.maxPrice} t={t} />}
        </div>
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
            <div className="emptyState inventoryNoMatches">
              <div className="emptyStateIcon" aria-hidden="true"><SearchX size={30} /></div>
              <p className="atelierKicker">{t.emptyKicker}</p>
              <h3>{noVehiclesAvailable ? t.emptyInventoryTitle : t.emptyTitle}</h3>
              <p>{noVehiclesAvailable ? t.emptyInventoryText : t.emptyText}</p>
              {!noVehiclesAvailable && activeFilterLabels.length > 0 && (
                <div className="emptyFilterSummary" aria-label={t.activeFilters}>
                  {activeFilterLabels.map((label) => <span key={label}>{label}</span>)}
                </div>
              )}
              <div className="emptyStateActions">
                {!noVehiclesAvailable && (
                  <button type="button" className="secondaryAction" onClick={clearFilters}>
                    <RotateCcw size={16} /> {t.clearFilters}
                  </button>
                )}
                <a href={hrefWithLanguage("/contact", language)} className="secondaryAction">{t.contactSales}</a>
              </div>
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

function FilterValidationMessage({ id, error, t }: { id: string; error: ListingFilterValidationError; t: typeof frontofficeCopy.en.inventory | typeof frontofficeCopy.zh.inventory }) {
  const message = error === "invalid-year"
    ? t.invalidYear
    : error === "invalid-price"
      ? t.invalidPrice
      : error === "year-range"
        ? t.invalidYearRange
        : t.invalidPriceRange;

  return <span className="filterValidationMessage" id={id} role="alert"><CircleAlert size={14} /> {message}</span>;
}
