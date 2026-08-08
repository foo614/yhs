import { afterEach, describe, expect, it, vi } from "vitest";
import { filterAndSortVehicles, listingFiltersFromSearchParams, type ListingFilters } from "./listing";
import {
  getPublicVehicle,
  getPublicVehicleDetailPageData,
  getPublicInventory,
  getPublicVehicles,
  publicVehicleFromApi,
  submitPublicContact,
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
    photoUrl: "/one.jpg",
    photoUrls: ["/one.jpg"]
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
    photoUrl: "/two.jpg",
    photoUrls: ["/two.jpg"]
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
    photoUrl: "/three.jpg",
    photoUrls: ["/three.jpg"]
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

  it("filters by maximum year, minimum price, and all stock owners", () => {
    const result = filterAndSortVehicles(vehicles, {
      maxYear: 2021,
      minPrice: 60000,
      stockOwner: "All",
      sort: "year-desc"
    });

    expect(result.map((vehicle) => vehicle.id)).toEqual(["two"]);
  });

  it("sorts vehicles by newest and price", () => {
    expect(filterAndSortVehicles(vehicles, { sort: "year-desc" }).map((vehicle) => vehicle.id)).toEqual(["three", "one", "two"]);
    expect(filterAndSortVehicles(vehicles, { sort: "price-asc" }).map((vehicle) => vehicle.id)).toEqual(["three", "one", "two"]);
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
      stockOwner: "All",
      sort: "price-asc"
    });

    expect(result).toEqual({
      query: "Vios",
      make: "Toyota",
      minYear: 2020,
      maxYear: 2022,
      minPrice: 30000,
      maxPrice: 60000,
      stockOwner: "All",
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
      descriptionMarkdown: "## Ready stock\n\n- Reverse camera",
      purchasePrice: 42000,
      additionalCharges: 600,
      refurbishmentTotal: 3500,
      commissionTotal: 1200
    } as const;
    const result = publicVehicleFromApi(apiVehicle, "http://localhost:5000");

    expect(result).toEqual(expect.objectContaining({
      id: "one",
      plateNumber: "VPK1234",
      make: "Toyota",
      model: "Vios",
      year: 2021,
      stockOwner: "YSHeng",
      status: "Available",
      sellingPrice: 58000,
      descriptionMarkdown: "## Ready stock\n\n- Reverse camera",
      photoUrl: "http://localhost:5000/api/public/vehicles/one/photo",
      photoUrls: [],
      fallbackPhotoUrl: "/vehicle-photo-pending.svg"
    }));
    expect(result.fallbackPhotoUrls).toEqual(["/vehicle-photo-pending.svg"]);
    expect(result.fallbackPhotoUrls?.[0]).toBe(result.fallbackPhotoUrl);
    expect("purchasePrice" in result).toBe(false);
    expect("refurbishmentTotal" in result).toBe(false);
    expect("commissionTotal" in result).toBe(false);
  });
});

describe("getPublicVehicles", () => {
  it("uses uploaded public photo URLs for inventory cards when available", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
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
          }
        ])
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([
          { id: "photo-1", fileName: "front.jpg", mimeType: "image/jpeg", uploadedAt: "2026-06-04T00:00:00Z" }
        ])
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPublicVehicles("http://localhost:5000");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/public/vehicles", { cache: "no-store" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/public/vehicles/available/photos", { cache: "no-store" });
    expect(result[0]).toEqual(expect.objectContaining({
      id: "available",
      photoUrl: "http://localhost:5000/api/public/vehicles/available/photos/photo-1",
      photoUrls: ["http://localhost:5000/api/public/vehicles/available/photos/photo-1"]
    }));
  });

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

  it("reports an unavailable inventory instead of showing sample vehicles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("API unavailable")));

    const inventory = await getPublicInventory();
    const vehicles = await getPublicVehicles();

    expect(inventory).toEqual({ vehicles: [], unavailable: true });
    expect(vehicles).toEqual([]);
  });
});

describe("getPublicVehicle", () => {
  it("loads vehicle details from the public detail endpoint", async () => {
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
          { id: "photo-1", fileName: "front.jpg", mimeType: "image/jpeg", uploadedAt: "2026-06-04T00:00:00Z" },
          { id: "photo-2", fileName: "rear.jpg", mimeType: "image/jpeg", uploadedAt: "2026-06-03T00:00:00Z" }
        ])
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPublicVehicle("vehicle-1", "http://localhost:5000");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/public/vehicles/vehicle-1", { cache: "no-store" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/public/vehicles/vehicle-1/photos", { cache: "no-store" });
    expect(result).toEqual(expect.objectContaining({
      id: "vehicle-1",
      plateNumber: "VPK1234",
      photoUrl: "http://localhost:5000/api/public/vehicles/vehicle-1/photos/photo-1",
      photoUrls: [
        "http://localhost:5000/api/public/vehicles/vehicle-1/photos/photo-1",
        "http://localhost:5000/api/public/vehicles/vehicle-1/photos/photo-2"
      ]
    }));
  });

  it("keeps the uploaded gallery empty and uses a labelled neutral image when there are no uploaded photos", async () => {
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
        json: vi.fn().mockResolvedValue([])
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPublicVehicle("vehicle-1", "http://localhost:5000");

    expect(result).toEqual(expect.objectContaining({
      photoUrl: "/vehicle-photo-pending.svg",
      photoUrls: [],
      isRepresentativePhoto: true
    }));
    expect(result?.fallbackPhotoUrls).toEqual(["/vehicle-photo-pending.svg"]);
    expect(result?.fallbackPhotoUrls?.[0]).toBe(result?.fallbackPhotoUrl);
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
        json: vi.fn().mockResolvedValue([])
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

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/public/vehicles/vehicle-1", { cache: "no-store" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/public/vehicles/vehicle-1/photos", { cache: "no-store" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:5000/api/public/vehicles", { cache: "no-store" });
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
        message: "Loan question",
        sourcePage: "",
        sourceReferrer: "",
        sourceCampaign: ""
      })
    }));
  });

  it("trims public lead source attribution before submitting", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "lead-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    const longCampaign = `utm_campaign=${"sale".repeat(160)}`;

    const result = await submitPublicLead({
      vehicleId: "vehicle-1",
      customerName: "Ali Tan",
      phone: "0123456789",
      sourcePage: " /vehicles/vehicle-1?utm_source=facebook ",
      sourceReferrer: " https://facebook.com/ ",
      sourceCampaign: ` ${longCampaign} `
    }, "http://localhost:5000");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/public/leads", expect.objectContaining({
      body: JSON.stringify({
        vehicleId: "vehicle-1",
        customerName: "Ali Tan",
        phone: "0123456789",
        message: "",
        sourcePage: "/vehicles/vehicle-1?utm_source=facebook",
        sourceReferrer: "https://facebook.com/",
        sourceCampaign: longCampaign.slice(0, 500)
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

describe("submitPublicContact", () => {
  it("trims and submits a general public contact enquiry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitPublicContact({
      customerName: "  Ali Tan  ",
      phone: " 0123456789 ",
      message: " Trade-in question ",
      sourcePage: " /contact?utm_source=facebook ",
      sourceReferrer: " https://facebook.com/ ",
      sourceCampaign: " utm_source=facebook "
    }, "http://localhost:5000");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/public/contact-enquiries", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Ali Tan",
        phone: "0123456789",
        message: "Trade-in question",
        sourcePage: "/contact?utm_source=facebook",
        sourceReferrer: "https://facebook.com/",
        sourceCampaign: "utm_source=facebook"
      })
    }));
  });

  it("blocks incomplete and overlong contact enquiries before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitPublicContact({ customerName: " ", phone: "0123456789", message: "Help" }))
      .resolves.toEqual({ ok: false, code: "customer_name_required", message: "Name is required." });
    await expect(submitPublicContact({ customerName: "Ali Tan", phone: " ", message: "Help" }))
      .resolves.toEqual({ ok: false, code: "phone_required", message: "Phone is required." });
    await expect(submitPublicContact({ customerName: "Ali Tan", phone: "0123456789", message: " " }))
      .resolves.toEqual({ ok: false, code: "message_required", message: "Message is required." });
    await expect(submitPublicContact({ customerName: "Ali Tan", phone: "0123456789", message: "x".repeat(2001) }))
      .resolves.toEqual({ ok: false, code: "message_too_long", message: "Message must be 2,000 characters or fewer." });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
