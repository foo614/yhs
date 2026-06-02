export type PublicStockOwner = "YSHeng" | "KS";
export type PublicVehicleStatus = "Available" | "LoanProcessing" | "Sold";

export type PublicVehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  stockOwner: PublicStockOwner;
  status: PublicVehicleStatus;
  sellingPrice: number;
  photoUrl: string;
};

type ApiVehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  stockOwner: PublicStockOwner;
  status: PublicVehicleStatus;
  sellingPrice: number;
};

export type PublicLeadPayload = {
  vehicleId: string;
  customerName: string;
  phone: string;
  message?: string;
};

export type PublicLeadErrorCode = "vehicle_required" | "customer_name_required" | "phone_required" | "submit_failed" | "validation_failed";
export type PublicLeadResult = { ok: true } | { ok: false; message: string; code: PublicLeadErrorCode | string };
export type PublicVehicleDetailPageData = { vehicle: PublicVehicle; vehicles: PublicVehicle[] };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000";

const fallbackVehicles: PublicVehicle[] = [
  {
    id: "9f5d6f16-9bb5-46b9-bb13-e8a8b3534737",
    plateNumber: "VPK1234",
    make: "Toyota",
    model: "Vios",
    year: 2021,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 58000,
    photoUrl: "https://images.unsplash.com/photo-1623869675781-80aa31012a5a?auto=format&fit=crop&w=900&q=84"
  },
  {
    id: "53af5d9e-ecb0-4f85-b7c5-0f56fd973571",
    plateNumber: "JRS8821",
    make: "Honda",
    model: "City",
    year: 2020,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 62000,
    photoUrl: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=900&q=84"
  },
  {
    id: "2b544508-501e-4958-8bd3-f0fe728f5e14",
    plateNumber: "BQM3108",
    make: "Perodua",
    model: "Myvi",
    year: 2019,
    stockOwner: "KS",
    status: "Available",
    sellingPrice: 39800,
    photoUrl: "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=84"
  },
  {
    id: "f8df54c3-7073-48e8-988f-67f249334b9c",
    plateNumber: "WXR7715",
    make: "Proton",
    model: "X70",
    year: 2022,
    stockOwner: "YSHeng",
    status: "LoanProcessing",
    sellingPrice: 89800,
    photoUrl: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=900&q=84"
  },
  {
    id: "fdc9ad77-96d8-474c-94f7-7f1646db7561",
    plateNumber: "KDH5520",
    make: "Nissan",
    model: "Serena",
    year: 2018,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 75800,
    photoUrl: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=900&q=84"
  },
  {
    id: "a07ce9a0-b4c7-4ced-8a50-00a7ea342a7e",
    plateNumber: "PMA4306",
    make: "Mazda",
    model: "CX-5",
    year: 2021,
    stockOwner: "KS",
    status: "Available",
    sellingPrice: 108000,
    photoUrl: "https://images.unsplash.com/photo-1616422285623-13ff0162193c?auto=format&fit=crop&w=900&q=84"
  },
  {
    id: "6f6abac7-c88f-4f88-b376-6122df4fe0aa",
    plateNumber: "VLT9012",
    make: "Toyota",
    model: "Alphard",
    year: 2017,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 168000,
    photoUrl: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=900&q=84"
  },
  {
    id: "c4b31677-79b2-4861-a38d-926f50c1774e",
    plateNumber: "JTR2409",
    make: "Honda",
    model: "HR-V",
    year: 2021,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 92800,
    photoUrl: "https://images.unsplash.com/photo-1600712242805-5f78671b24da?auto=format&fit=crop&w=900&q=84"
  }
];

export async function getPublicVehicles(baseUrl = apiBaseUrl): Promise<PublicVehicle[]> {
  try {
    const response = await fetch(`${baseUrl}/api/public/vehicles`, { next: { revalidate: 30 } });
    if (!response.ok) return availableVehicles(fallbackVehicles);
    const vehicles = await response.json();
    return withPhotoUrls(vehicles, baseUrl);
  } catch {
    return availableVehicles(fallbackVehicles);
  }
}

export async function getPublicVehicle(id: string, baseUrl = apiBaseUrl): Promise<PublicVehicle | null> {
  try {
    const response = await fetch(`${baseUrl}/api/public/vehicles/${id}`, { next: { revalidate: 30 } });
    if (!response.ok) {
      return availableVehicles(fallbackVehicles).find((vehicle) => vehicle.id === id) ?? null;
    }
    const payload = await response.json();
    if (!isValidApiVehicle(payload)) {
      return availableVehicles(fallbackVehicles).find((vehicle) => vehicle.id === id) ?? null;
    }
    const vehicle = publicVehicleFromApi(payload, baseUrl);
    return vehicle.status === "Available" ? vehicle : null;
  } catch {
    return availableVehicles(fallbackVehicles).find((vehicle) => vehicle.id === id) ?? null;
  }
}

export async function getPublicVehicleDetailPageData(id: string, baseUrl = apiBaseUrl): Promise<PublicVehicleDetailPageData | null> {
  const vehicle = await getPublicVehicle(id, baseUrl);
  if (!vehicle) return null;
  return {
    vehicle,
    vehicles: await getPublicVehicles(baseUrl)
  };
}

export function publicVehicleFromApi(vehicle: ApiVehicle, baseUrl = apiBaseUrl): PublicVehicle {
  return {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    stockOwner: vehicle.stockOwner,
    status: vehicle.status,
    sellingPrice: vehicle.sellingPrice,
    photoUrl: `${baseUrl}/api/public/vehicles/${vehicle.id}/photo`
  };
}

export async function submitPublicLead(payload: PublicLeadPayload, baseUrl = apiBaseUrl): Promise<PublicLeadResult> {
  const cleanedPayload = {
    vehicleId: payload.vehicleId.trim(),
    customerName: payload.customerName.trim(),
    phone: payload.phone.trim(),
    message: payload.message?.trim() ?? ""
  };

  const blockReason = publicLeadBlockReason(cleanedPayload);
  if (blockReason) {
    return { ok: false, code: blockReason.code, message: blockReason.message };
  }

  try {
    const response = await fetch(`${baseUrl}/api/public/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleanedPayload)
    });

    if (response.ok) return { ok: true };
    return await validationError(response);
  } catch {
    return { ok: false, code: "submit_failed", message: "Could not send enquiry. Please try again." };
  }
}

function publicLeadBlockReason(payload: PublicLeadPayload) {
  if (!payload.vehicleId) {
    return { code: "vehicle_required" as const, message: "Vehicle is required." };
  }

  if (!payload.customerName) {
    return { code: "customer_name_required" as const, message: "Name is required." };
  }

  if (!payload.phone) {
    return { code: "phone_required" as const, message: "Phone is required." };
  }

  return undefined;
}

function isValidApiVehicle(vehicle: unknown): vehicle is ApiVehicle {
  return typeof vehicle === "object" && vehicle !== null
    && typeof (vehicle as ApiVehicle).id === "string"
    && typeof (vehicle as ApiVehicle).plateNumber === "string"
    && typeof (vehicle as ApiVehicle).make === "string"
    && typeof (vehicle as ApiVehicle).model === "string"
    && typeof (vehicle as ApiVehicle).year === "number"
    && typeof (vehicle as ApiVehicle).stockOwner === "string"
    && typeof (vehicle as ApiVehicle).status === "string"
    && typeof (vehicle as ApiVehicle).sellingPrice === "number";
}

function withPhotoUrls(vehicles: ApiVehicle[], baseUrl = apiBaseUrl): PublicVehicle[] {
  return availableVehicles(vehicles.map((vehicle) => publicVehicleFromApi(vehicle, baseUrl)));
}

function availableVehicles(vehicles: PublicVehicle[]): PublicVehicle[] {
  return vehicles.filter((vehicle) => vehicle.status === "Available");
}

async function validationError(response: Response): Promise<Extract<PublicLeadResult, { ok: false }>> {
  try {
    const body = await response.json();
    const firstError = Array.isArray(body?.errors) ? body.errors[0] : undefined;
    if (firstError?.message) return { ok: false, code: String(firstError.code ?? "validation_failed"), message: String(firstError.message) };
    if (body?.message) return { ok: false, code: "validation_failed", message: String(body.message) };
  } catch {
    // Fall through to the generic message.
  }
  return { ok: false, code: "validation_failed", message: "Could not send enquiry. Please check the form and try again." };
}
