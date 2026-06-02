import type { PublicVehicle } from "./service";

export type ListingSort = "year-desc" | "price-asc" | "price-desc";

export type ListingFilters = {
  query?: string;
  make?: string;
  minYear?: number;
  maxYear?: number;
  minPrice?: number;
  maxPrice?: number;
  stockOwner?: PublicVehicle["stockOwner"] | "All";
  sort?: ListingSort;
};

export type ListingSearchParams = Record<string, string | string[] | undefined>;

export function listingFiltersFromSearchParams(params: ListingSearchParams): ListingFilters {
  return {
    query: [firstParam(params.q), firstParam(params.model)].map((value) => value?.trim()).filter(Boolean).join(" ") || undefined,
    make: firstParam(params.make)?.trim() || undefined,
    minYear: numericParam(params.minYear),
    maxYear: numericParam(params.maxYear),
    minPrice: numericParam(params.minPrice),
    maxPrice: numericParam(params.maxPrice),
    stockOwner: stockOwnerParam(params.stockOwner),
    sort: sortParam(params.sort)
  };
}

export function filterAndSortVehicles(vehicles: PublicVehicle[], filters: ListingFilters): PublicVehicle[] {
  const queryTokens = filters.query?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const make = filters.make?.trim().toLowerCase();

  return vehicles
    .filter((vehicle) => {
      const searchable = [vehicle.make, vehicle.model, vehicle.plateNumber, String(vehicle.year)].join(" ").toLowerCase();
      const matchesQuery = queryTokens.length === 0 || queryTokens.every((token) => searchable.includes(token));
      const matchesMake = !make || vehicle.make.toLowerCase() === make;
      const matchesMinYear = filters.minYear === undefined || vehicle.year >= filters.minYear;
      const matchesMaxYear = filters.maxYear === undefined || vehicle.year <= filters.maxYear;
      const matchesMinPrice = filters.minPrice === undefined || vehicle.sellingPrice >= filters.minPrice;
      const matchesMaxPrice = filters.maxPrice === undefined || vehicle.sellingPrice <= filters.maxPrice;
      const matchesStockOwner = !filters.stockOwner || filters.stockOwner === "All" || vehicle.stockOwner === filters.stockOwner;

      return matchesQuery && matchesMake && matchesMinYear && matchesMaxYear && matchesMinPrice && matchesMaxPrice && matchesStockOwner;
    })
    .sort((left, right) => {
      switch (filters.sort ?? "year-desc") {
        case "price-asc":
          return left.sellingPrice - right.sellingPrice;
        case "price-desc":
          return right.sellingPrice - left.sellingPrice;
        case "year-desc":
        default:
          return right.year - left.year || left.sellingPrice - right.sellingPrice;
      }
    });
}

export function distinctMakes(vehicles: PublicVehicle[]): string[] {
  return [...new Set(vehicles.map((vehicle) => vehicle.make).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function priceRange(vehicles: PublicVehicle[]) {
  const prices = vehicles.map((vehicle) => vehicle.sellingPrice);
  return {
    min: prices.length ? Math.min(...prices) : 0,
    max: prices.length ? Math.max(...prices) : 0
  };
}

export function relatedVehicles(vehicles: PublicVehicle[], vehicle: PublicVehicle, limit = 3): PublicVehicle[] {
  const sameMake = vehicles.filter((item) => item.id !== vehicle.id && item.make === vehicle.make);
  const others = vehicles.filter((item) => item.id !== vehicle.id && item.make !== vehicle.make);
  return [...sameMake, ...others].slice(0, limit);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numericParam(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function stockOwnerParam(value: string | string[] | undefined): ListingFilters["stockOwner"] {
  const parsed = firstParam(value)?.trim();
  return parsed === "YSHeng" || parsed === "KS" || parsed === "All" ? parsed : undefined;
}

function sortParam(value: string | string[] | undefined): ListingSort | undefined {
  const parsed = firstParam(value)?.trim();
  return parsed === "year-desc" || parsed === "price-asc" || parsed === "price-desc" ? parsed : undefined;
}
