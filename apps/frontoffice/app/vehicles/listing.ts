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
export type ListingFilterInputName = "minYear" | "maxYear" | "minPrice" | "maxPrice";
export type ListingFilterInputs = Record<ListingFilterInputName, string>;
export type ListingFilterValidationError = "invalid-year" | "invalid-price" | "year-range" | "price-range";
export type ListingFilterValidation = {
  filters: Pick<ListingFilters, ListingFilterInputName>;
  errors: Partial<Record<ListingFilterInputName, ListingFilterValidationError>>;
};

const EARLIEST_VEHICLE_YEAR = 1886;
const LOWEST_VEHICLE_PRICE = 1;

export function validateListingFilterInputs(inputs: ListingFilterInputs, latestModelYear = new Date().getFullYear() + 1): ListingFilterValidation {
  const minYear = parseWholeNumber(inputs.minYear, EARLIEST_VEHICLE_YEAR, latestModelYear);
  const maxYear = parseWholeNumber(inputs.maxYear, EARLIEST_VEHICLE_YEAR, latestModelYear);
  const minPrice = parseWholeNumber(inputs.minPrice, LOWEST_VEHICLE_PRICE, Number.MAX_SAFE_INTEGER);
  const maxPrice = parseWholeNumber(inputs.maxPrice, LOWEST_VEHICLE_PRICE, Number.MAX_SAFE_INTEGER);
  const errors: ListingFilterValidation["errors"] = {};

  if (!minYear.valid) errors.minYear = "invalid-year";
  if (!maxYear.valid) errors.maxYear = "invalid-year";
  if (!minPrice.valid) errors.minPrice = "invalid-price";
  if (!maxPrice.valid) errors.maxPrice = "invalid-price";

  if (!errors.minYear && !errors.maxYear && minYear.value !== undefined && maxYear.value !== undefined && minYear.value > maxYear.value) {
    errors.minYear = "year-range";
    errors.maxYear = "year-range";
  }

  if (!errors.minPrice && !errors.maxPrice && minPrice.value !== undefined && maxPrice.value !== undefined && minPrice.value > maxPrice.value) {
    errors.minPrice = "price-range";
    errors.maxPrice = "price-range";
  }

  return {
    filters: {
      minYear: errors.minYear || errors.maxYear ? undefined : minYear.value,
      maxYear: errors.minYear || errors.maxYear ? undefined : maxYear.value,
      minPrice: errors.minPrice || errors.maxPrice ? undefined : minPrice.value,
      maxPrice: errors.minPrice || errors.maxPrice ? undefined : maxPrice.value
    },
    errors
  };
}

export function listingFiltersFromSearchParams(params: ListingSearchParams): ListingFilters {
  const rangeFilters = validateListingFilterInputs({
    minYear: firstParam(params.minYear) ?? "",
    maxYear: firstParam(params.maxYear) ?? "",
    minPrice: firstParam(params.minPrice) ?? "",
    maxPrice: firstParam(params.maxPrice) ?? ""
  });

  return {
    query: [firstParam(params.q), firstParam(params.model)].map((value) => value?.trim()).filter(Boolean).join(" ") || undefined,
    make: firstParam(params.make)?.trim() || undefined,
    ...rangeFilters.filters,
    stockOwner: stockOwnerParam(params.stockOwner),
    sort: sortParam(params.sort)
  };
}

export function filterAndSortVehicles(vehicles: PublicVehicle[], filters: ListingFilters): PublicVehicle[] {
  const rangeFilters = validateListingFilterInputs({
    minYear: filters.minYear === undefined ? "" : String(filters.minYear),
    maxYear: filters.maxYear === undefined ? "" : String(filters.maxYear),
    minPrice: filters.minPrice === undefined ? "" : String(filters.minPrice),
    maxPrice: filters.maxPrice === undefined ? "" : String(filters.maxPrice)
  }).filters;
  const queryTokens = filters.query?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const make = filters.make?.trim().toLowerCase();

  return vehicles
    .filter((vehicle) => {
      const searchable = [vehicle.make, vehicle.model, vehicle.plateNumber, String(vehicle.year)].join(" ").toLowerCase();
      const matchesQuery = queryTokens.length === 0 || queryTokens.every((token) => searchable.includes(token));
      const matchesMake = !make || vehicle.make.toLowerCase() === make;
      const matchesMinYear = rangeFilters.minYear === undefined || vehicle.year >= rangeFilters.minYear;
      const matchesMaxYear = rangeFilters.maxYear === undefined || vehicle.year <= rangeFilters.maxYear;
      const matchesMinPrice = rangeFilters.minPrice === undefined || vehicle.sellingPrice >= rangeFilters.minPrice;
      const matchesMaxPrice = rangeFilters.maxPrice === undefined || vehicle.sellingPrice <= rangeFilters.maxPrice;
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

function parseWholeNumber(value: string, minimum: number, maximum: number) {
  const trimmed = value.trim();
  if (!trimmed) return { valid: true, value: undefined };
  if (!/^\d+$/.test(trimmed)) return { valid: false, value: undefined };

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? { valid: true, value: parsed }
    : { valid: false, value: undefined };
}

function stockOwnerParam(value: string | string[] | undefined): ListingFilters["stockOwner"] {
  const parsed = firstParam(value)?.trim();
  return parsed === "YSHeng" || parsed === "KS" || parsed === "All" ? parsed : undefined;
}

function sortParam(value: string | string[] | undefined): ListingSort | undefined {
  const parsed = firstParam(value)?.trim();
  return parsed === "year-desc" || parsed === "price-asc" || parsed === "price-desc" ? parsed : undefined;
}
