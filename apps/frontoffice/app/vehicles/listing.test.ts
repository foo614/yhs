import { afterEach, describe, expect, it, vi } from "vitest";
import { filterAndSortVehicles, listingFiltersFromSearchParams, type ListingFilters } from "./listing";
import {
  getPublicVehicle,
  getPublicVehicleDetailPageData,
  getPublicVehicles,
  publicVehicleFromApi,
  submitPublicLead,
  type PublicVehicle
} from "./service";

afterEach(() => {
  vi.unstubAllGlobals();
});

const vehicles: PublicVehicle[] = [
  {
    id: "one",
    plateNumber: "VPK1234",
    make: "Toyota",
    model: "Vios",
    year: 2021,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 58000,
    photoUrl: "/one.jpg"
  },
  {
    id: "two",
    plateNumber: "JSD8899",
    make: "Honda",
    model: "City",
    year: 2020,
    stockOwner: "KS",
    status: "Available",
    sellingPrice: 64000,
    photoUrl: "/two.jpg"
  },
  {
    id: "three",
    plateNumber: "WXX7788",
    make: "Perodua",
    model: "Myvi",
    year: 2023,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 42000,
    photoUrl: "/three.jpg"
  }
];

describe("filterAndSortVehicles", () => {
  it("matches make, model, and plate searches case-insensitively", () => {
    const filters: ListingFilters = { query: "vpk", sort: "price-asc" };

    const result = filterAndSortVehicles(vehicles, filters);

    expect(result.map((vehicle) => vehicle.id)).toEqual(["one"]);
  });

  it("matches multi-token make and model searches across vehicle fields", () => {
    const result = filterAndSortVehicles(vehicles, { query: "Toyota Vios" });

    expect(result.map((vehicle) => vehicle.id)).toEqual(["one"]);
  });

  it("filters by structured make from the homepage selector", () => {
    const result = filterAndSortVehicles(vehicles, { make: "Honda" });

    expect(result.map((vehicle) => vehicle.id)).toEqual(["two"]);
  });

  it("filters by year, price, and stock owner", () => {
    const filters: ListingFilters = {
      minYear: 2021,
      maxPrice: 60000,
      stockOwner: "YSHeng",
      sort: "year-desc"
    };

    const result = filterAndSortVehicles(vehicles, filters);

    expect(result.map((vehicle) => vehicle.id)).toEqual(["three", "one"]);
  });

  it("sorts vehicles by newest and price", () => {
    expect(filterAndSortVehicles(vehicles, { sort: "year-desc" }).map((vehicle) => vehicle.id)).toEqual(["three", "one", "two"]);
    expect(filterAndSortVehicles(vehicles, { sort: "price-desc" }).map((vehicle) => vehicle.id)).toEqual(["two", "one", "three"]);
  });
});

describe("listingFiltersFromSearchParams", () => {
  it("combines make and model search params and keeps valid price and year filters", () => {
    const result = listingFiltersFromSearchParams({
      make: "Toyota",
      model: "Vios",
      minYear: "2020",
      maxYear: "2022",
      minPrice: "30000",
      maxPrice: "60000",
      stockOwner: "YSHeng",
      sort: "price-asc"
    });

    expect(result).toEqual({
      query: "Vios",
      make: "Toyota",
      minYear: 2020,
      maxYear: 2022,
      minPrice: 30000,
      maxPrice: 60000,
      stockOwner: "YSHeng",
      sort: "price-asc"
    });
  });

  it("uses the first repeated search param and ignores invalid numeric and option filters", () => {
    const result = listingFiltersFromSearchParams({
      q: ["Honda", "Toyota"],
      model: ["City", "Vios"],
      minYear: "soon",
      maxYear: "later",
      minPrice: "0",
      maxPrice: "-100",
      stockOwner: "Unknown",
      sort: "random"
    });

    expect(result).toEqual({
      query: "Honda City",
      minYear: undefined,
      maxYear: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      stockOwner: undefined,
      sort: undefined
    });
  });
});

describe("publicVehicleFromApi", () => {
  it("strips internal pricing and workflow fields from API vehicles", () => {
    const apiVehicle = {
      id: "one",
      plateNumber: "VPK1234",
      make: "Toyota",
      model: "Vios",
      year: 2021,
      stockOwner: "YSHeng",
      status: "Available",
      isPublic: true,
      sellingPrice: 58000,
      purchasePrice: 42000,
      additionalCharges: 600,
      refurbishmentTotal: 3500,
      commissionTotal: 1200
    } as const;
    const result = publicVehicleFromApi(apiVehicle, "http://localhost:5000");

    expect(result).toEqual({
      id: "one",
      plateNumber: "VPK1234",
      make: "Toyota",
      model: "Vios",
      year: 2021,
      stockOwner: "YSHeng",
      status: "Available",
      sellingPrice: 58000,
      photoUrl: "http://localhost:5000/api/public/vehicles/one/photo"
    });
    expect("purchasePrice" in result).toBe(false);
    expect("refurbishmentTotal" in result).toBe(false);
    expect("commissionTotal" in result).toBe(false);
  });
});

describe("getPublicVehicles", () => {
  it("only returns available vehicles from API inventory responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          id: "available",
          plateNumber: "VPK1234",
          make: "Toyota",
          model: "Vios",
          year: 2021,
          stockOwner: "YSHeng",
          status: "Available",
          sellingPrice: 58000
        },
        {
          id: "loan",
          plateNumber: "WXR7715",
          make: "Proton",
          model: "X70",
          year: 2022,
          stockOwner: "YSHeng",
          status: "LoanProcessing",
          sellingPrice: 89800
        },
        {
          id: "sold",
          plateNumber: "KDH5520",
          make: "Nissan",
          model: "Serena",
          year: 2018,
          stockOwner: "YSHeng",
          status: "Sold",
          sellingPrice: 75800
        }
      ])
    }));

    const result = await getPublicVehicles();

    expect(result.map((vehicle) => vehicle.id)).toEqual(["available"]);
  });

  it("keeps fallback inventory limited to available vehicles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("API unavailable")));

    const result = await getPublicVehicles();

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((vehicle) => vehicle.status === "Available")).toBe(true);
    expect(result.map((vehicle) => vehicle.id)).not.toContain("f8df54c3-7073-48e8-988f-67f249334b9c");
  });
});

describe("getPublicVehicle", () => {
  it("loads vehicle details from the public detail endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: "vehicle-1",
        plateNumber: "VPK1234",
        make: "Toyota",
        model: "Vios",
        year: 2021,
        stockOwner: "YSHeng",
        status: "Available",
        sellingPrice: 58000
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPublicVehicle("vehicle-1", "http://localhost:5000");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/public/vehicles/vehicle-1", { next: { revalidate: 30 } });
    expect(result).toEqual(expect.objectContaining({
      id: "vehicle-1",
      plateNumber: "VPK1234",
      photoUrl: "http://localhost:5000/api/public/vehicles/vehicle-1/photo"
    }));
  });

  it("returns null when the public detail endpoint rejects the vehicle", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(getPublicVehicle("sold-vehicle", "http://localhost:5000")).resolves.toBeNull();
  });
});

describe("getPublicVehicleDetailPageData", () => {
  it("loads the public detail endpoint before fetching inventory for related vehicles", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "vehicle-1",
          plateNumber: "VPK1234",
          make: "Toyota",
          model: "Vios",
          year: 2021,
          stockOwner: "YSHeng",
          status: "Available",
          sellingPrice: 58000
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([
          {
            id: "vehicle-1",
            plateNumber: "VPK1234",
            make: "Toyota",
            model: "Vios",
            year: 2021,
            stockOwner: "YSHeng",
            status: "Available",
            sellingPrice: 58000
          },
          {
            id: "vehicle-2",
            plateNumber: "JRS8821",
            make: "Honda",
            model: "City",
            year: 2020,
            stockOwner: "YSHeng",
            status: "Available",
            sellingPrice: 62000
          }
        ])
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPublicVehicleDetailPageData("vehicle-1", "http://localhost:5000");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/public/vehicles/vehicle-1", { next: { revalidate: 30 } });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/public/vehicles", { next: { revalidate: 30 } });
    expect(result?.vehicle.id).toBe("vehicle-1");
    expect(result?.vehicles.map((vehicle) => vehicle.id)).toEqual(["vehicle-1", "vehicle-2"]);
  });

  it("does not fetch inventory when the public detail endpoint rejects the vehicle", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicVehicleDetailPageData("sold-vehicle", "http://localhost:5000")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("submitPublicLead", () => {
  it("trims and submits public lead payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "lead-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitPublicLead({
      vehicleId: "vehicle-1",
      customerName: "  Ali Tan  ",
      phone: " 0123456789 ",
      message: " Loan question "
    }, "http://localhost:5000");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/public/leads", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: "vehicle-1",
        customerName: "Ali Tan",
        phone: "0123456789",
        message: "Loan question"
      })
    }));
  });

  it("returns backend validation messages for public lead errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        errors: [
          { code: "phone_required", message: "Phone is required." }
        ]
      })
    }));

    const result = await submitPublicLead({
      vehicleId: "vehicle-1",
      customerName: "Ali Tan",
      phone: "",
      message: ""
    }, "http://localhost:5000");

    expect(result).toEqual({ ok: false, code: "phone_required", message: "Phone is required." });
  });

  it("blocks blank public lead fields before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitPublicLead({
      vehicleId: " ",
      customerName: "Ali Tan",
      phone: "0123456789",
      message: ""
    }, "http://localhost:5000")).resolves.toEqual({ ok: false, code: "vehicle_required", message: "Vehicle is required." });

    await expect(submitPublicLead({
      vehicleId: "vehicle-1",
      customerName: " ",
      phone: "0123456789",
      message: ""
    }, "http://localhost:5000")).resolves.toEqual({ ok: false, code: "customer_name_required", message: "Name is required." });

    await expect(submitPublicLead({
      vehicleId: "vehicle-1",
      customerName: "Ali Tan",
      phone: " ",
      message: ""
    }, "http://localhost:5000")).resolves.toEqual({ ok: false, code: "phone_required", message: "Phone is required." });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves backend lead validation codes for localized form messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        errors: [
          { code: "customer_name_required", message: "Customer name is required." }
        ]
      })
    }));

    const result = await submitPublicLead({
      vehicleId: "vehicle-1",
      customerName: "Ali Tan",
      phone: "0123456789",
      message: ""
    }, "http://localhost:5000");

    expect(result).toEqual({ ok: false, code: "customer_name_required", message: "Customer name is required." });
  });
});
