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
  photoUrls: string[];
  fallbackPhotoUrl?: string;
  fallbackPhotoUrls?: string[];
  isRepresentativePhoto?: boolean;
};

export type PublicVehiclePhoto = {
  id: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
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

type VehiclePhotoIdentity = Pick<ApiVehicle, "make" | "model"> & Partial<Pick<ApiVehicle, "id" | "plateNumber">>;

export type PublicLeadPayload = {
  vehicleId: string;
  customerName: string;
  phone: string;
  message?: string;
  sourcePage?: string;
  sourceReferrer?: string;
  sourceCampaign?: string;
};

export type PublicLeadErrorCode = "vehicle_required" | "customer_name_required" | "phone_required" | "message_required" | "message_too_long" | "submit_failed" | "validation_failed";
export type PublicLeadResult = { ok: true } | { ok: false; message: string; code: PublicLeadErrorCode | string };
export type PublicVehicleDetailPageData = { vehicle: PublicVehicle; vehicles: PublicVehicle[] };
export type PublicInventoryResult = { vehicles: PublicVehicle[]; unavailable: boolean };
export type PublicContactPayload = {
  customerName: string;
  phone: string;
  message: string;
  sourcePage?: string;
  sourceReferrer?: string;
  sourceCampaign?: string;
};

const publicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000";
const apiBaseUrl = typeof window === "undefined" ? process.env.API_BASE_URL ?? publicApiBaseUrl : publicApiBaseUrl;
const neutralVehicleFallbackPhotoUrl = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/vehicle-photo-pending.svg`;

const wikimediaPhotos = {
  bmw320i: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/BMW_G20_LCI_320i_Alpine_White_%282%29.jpg/1280px-BMW_G20_LCI_320i_Alpine_White_%282%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/BMW_G20_LCI_320i_Black_Sapphire_Metallic_%2815%29.jpg/1280px-BMW_G20_LCI_320i_Black_Sapphire_Metallic_%2815%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/BMW_320i_M_Sport_%28G20%29_rear.jpg/1280px-BMW_320i_M_Sport_%28G20%29_rear.jpg",
    "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1000&q=84"
  ],
  camry: [
    "https://images.unsplash.com/photo-1549924231-f129b911e442?auto=format&fit=crop&w=1000&q=84",
    "https://images.unsplash.com/photo-1494905998402-395d579af36f?auto=format&fit=crop&w=1000&q=84",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/2019_Toyota_Camry_2.5_V_%2813%29.jpg/1280px-2019_Toyota_Camry_2.5_V_%2813%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/2019_Toyota_Camry_2.5_V_%2828%29.jpg/1280px-2019_Toyota_Camry_2.5_V_%2828%29.jpg"
  ],
  city: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Honda_City_1.5_RS_2020_%281%29.jpg/1280px-Honda_City_1.5_RS_2020_%281%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Honda_City_SV_2020.jpg/1280px-Honda_City_SV_2020.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/2020_Honda_City_e-HEV_RS.jpg/1280px-2020_Honda_City_e-HEV_RS.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Honda_City_2020.jpg/1280px-Honda_City_2020.jpg"
  ],
  c200: [
    "https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=1000&q=84",
    "https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=1000&q=84",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/2019_Mercedes-Benz_C200_AMG_Line_Premium_Automatic_1.5_Front.jpg/1280px-2019_Mercedes-Benz_C200_AMG_Line_Premium_Automatic_1.5_Front.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/2019_Mercedes-Benz_C200_AMG_Line_Premium_Automatic_1.5_Rear.jpg/1280px-2019_Mercedes-Benz_C200_AMG_Line_Premium_Automatic_1.5_Rear.jpg"
  ],
  myvi: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/2019_Perodua_Myvi_1.5_AV_%2883%29.jpg/1280px-2019_Perodua_Myvi_1.5_AV_%2883%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/2019_Perodua_Myvi_1.5_AV_%288%29.jpg/1280px-2019_Perodua_Myvi_1.5_AV_%288%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Perodua_Myvi_3rd_generation.jpg/1280px-Perodua_Myvi_3rd_generation.jpg",
    "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=1000&q=84"
  ],
  vios: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/2021_Toyota_Vios_1.3_XLE.jpg/1280px-2021_Toyota_Vios_1.3_XLE.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Toyota_Vios_1.5_G_2021_%281%29.jpg/1280px-Toyota_Vios_1.5_G_2021_%281%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Toyota_Vios_1.5_GR_Sport_2021.jpg/1280px-Toyota_Vios_1.5_GR_Sport_2021.jpg",
    "https://images.unsplash.com/photo-1549924231-f129b911e442?auto=format&fit=crop&w=1000&q=84"
  ],
  x70: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/2020_Proton_X70_Premium_%28CKD%29_front_view_01.png/1280px-2020_Proton_X70_Premium_%28CKD%29_front_view_01.png",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/2020_Proton_X70_Premium_%28CKD%29_front_view_02.png/1280px-2020_Proton_X70_Premium_%28CKD%29_front_view_02.png",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/2023_Proton_X70_MC_Front.jpg/1280px-2023_Proton_X70_MC_Front.jpg",
    "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1000&q=84"
  ]
};

export const previewVehicles: PublicVehicle[] = ([
  {
    id: "9f5d6f16-9bb5-46b9-bb13-e8a8b3534737",
    plateNumber: "VPK1234",
    make: "Toyota",
    model: "Vios",
    year: 2021,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 58000,
    photoUrl: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=84"]
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
    photoUrl: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=900&q=84"]
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
    photoUrl: "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=84"]
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
    photoUrl: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=900&q=84"]
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
    photoUrl: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=900&q=84"]
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
    photoUrl: "https://images.unsplash.com/photo-1616422285623-13ff0162193c?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1616422285623-13ff0162193c?auto=format&fit=crop&w=900&q=84"]
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
    photoUrl: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=900&q=84"]
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
    photoUrl: "https://images.unsplash.com/photo-1600712242805-5f78671b24da?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1600712242805-5f78671b24da?auto=format&fit=crop&w=900&q=84"]
  }
] satisfies PublicVehicle[]).map(withFallbackVehiclePhotos);

export async function getPublicInventory(fetchBaseUrl = apiBaseUrl, assetBaseUrl = publicApiBaseUrl): Promise<PublicInventoryResult> {
  try {
    const response = await fetch(`${fetchBaseUrl}/api/public/vehicles`, { cache: "no-store" });
    if (!response.ok) return { vehicles: [], unavailable: true };
    const vehicles = await response.json();
    if (!Array.isArray(vehicles)) return { vehicles: [], unavailable: true };
    return { vehicles: await withPhotoUrls(vehicles, fetchBaseUrl, assetBaseUrl), unavailable: false };
  } catch {
    return { vehicles: [], unavailable: true };
  }
}

export async function getPublicVehicles(fetchBaseUrl = apiBaseUrl, assetBaseUrl = publicApiBaseUrl): Promise<PublicVehicle[]> {
  return (await getPublicInventory(fetchBaseUrl, assetBaseUrl)).vehicles;
}

export async function getPublicVehicle(id: string, fetchBaseUrl = apiBaseUrl, assetBaseUrl = publicApiBaseUrl): Promise<PublicVehicle | null> {
  try {
    const response = await fetch(`${fetchBaseUrl}/api/public/vehicles/${id}`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!isValidApiVehicle(payload)) return null;
    const vehicle = publicVehicleFromApi(payload, assetBaseUrl);
    const photoUrls = await getPublicVehiclePhotoUrls(id, fetchBaseUrl, assetBaseUrl);
    if (photoUrls.length > 0) {
      vehicle.photoUrls = photoUrls;
      vehicle.photoUrl = photoUrls[0];
    }
    return vehicle.status === "Available"
      ? photoUrls.length > 0 ? vehicle : { ...vehicle, photoUrl: vehicle.fallbackPhotoUrl ?? neutralVehicleFallbackPhotoUrl, isRepresentativePhoto: true }
      : null;
  } catch {
    return null;
  }
}

export async function getPublicVehicleDetailPageData(id: string, fetchBaseUrl = apiBaseUrl, assetBaseUrl = publicApiBaseUrl): Promise<PublicVehicleDetailPageData | null> {
  const vehicle = await getPublicVehicle(id, fetchBaseUrl, assetBaseUrl);
  if (!vehicle) return null;
  return {
    vehicle,
    vehicles: await getPublicVehicles(fetchBaseUrl, assetBaseUrl)
  };
}

export function publicVehicleFromApi(vehicle: ApiVehicle, baseUrl = apiBaseUrl): PublicVehicle {
  const photoUrl = `${baseUrl}/api/public/vehicles/${vehicle.id}/photo`;
  const fallbackPhotoUrls = vehicleFallbackPhotoUrls(vehicle);
  return {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    stockOwner: vehicle.stockOwner,
    status: vehicle.status,
    sellingPrice: vehicle.sellingPrice,
    photoUrl,
    photoUrls: [],
    fallbackPhotoUrl: fallbackPhotoUrls[0],
    fallbackPhotoUrls
  };
}

export async function getPublicVehiclePhotoUrls(id: string, fetchBaseUrl = apiBaseUrl, assetBaseUrl = publicApiBaseUrl): Promise<string[]> {
  try {
    const response = await fetch(`${fetchBaseUrl}/api/public/vehicles/${id}/photos`, { cache: "no-store" });
    if (!response.ok) return [];
    const photos = await response.json();
    if (!Array.isArray(photos)) return [];
    return photos
      .filter(isValidPublicVehiclePhoto)
      .map((photo) => `${assetBaseUrl}/api/public/vehicles/${id}/photos/${photo.id}`);
  } catch {
    return [];
  }
}

export async function submitPublicLead(payload: PublicLeadPayload, baseUrl = apiBaseUrl): Promise<PublicLeadResult> {
  const cleanedPayload = {
    vehicleId: payload.vehicleId.trim(),
    customerName: payload.customerName.trim(),
    phone: payload.phone.trim(),
    message: payload.message?.trim() ?? "",
    sourcePage: payload.sourcePage?.trim().slice(0, 500) ?? "",
    sourceReferrer: payload.sourceReferrer?.trim().slice(0, 500) ?? "",
    sourceCampaign: payload.sourceCampaign?.trim().slice(0, 500) ?? ""
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

function isValidPublicVehiclePhoto(photo: unknown): photo is PublicVehiclePhoto {
  return typeof photo === "object" && photo !== null
    && typeof (photo as PublicVehiclePhoto).id === "string"
    && typeof (photo as PublicVehiclePhoto).fileName === "string"
    && typeof (photo as PublicVehiclePhoto).mimeType === "string"
    && typeof (photo as PublicVehiclePhoto).uploadedAt === "string";
}

async function withPhotoUrls(vehicles: ApiVehicle[], fetchBaseUrl = apiBaseUrl, assetBaseUrl = publicApiBaseUrl): Promise<PublicVehicle[]> {
  const publicVehicles = availableVehicles(vehicles.map((vehicle) => publicVehicleFromApi(vehicle, assetBaseUrl)));

  return Promise.all(publicVehicles.map(async (vehicle) => {
    const photoUrls = await getPublicVehiclePhotoUrls(vehicle.id, fetchBaseUrl, assetBaseUrl);
    if (photoUrls.length > 0) {
      return {
        ...vehicle,
        photoUrl: photoUrls[0],
        photoUrls
      };
    }

    return {
      ...vehicle,
      photoUrl: vehicle.fallbackPhotoUrl ?? neutralVehicleFallbackPhotoUrl,
      isRepresentativePhoto: true
    };
  }));
}

export async function submitPublicContact(payload: PublicContactPayload, baseUrl = apiBaseUrl): Promise<PublicLeadResult> {
  const cleanedPayload = {
    customerName: payload.customerName.trim(),
    phone: payload.phone.trim(),
    message: payload.message.trim(),
    sourcePage: payload.sourcePage?.trim().slice(0, 500) ?? "",
    sourceReferrer: payload.sourceReferrer?.trim().slice(0, 500) ?? "",
    sourceCampaign: payload.sourceCampaign?.trim().slice(0, 500) ?? ""
  };

  if (!cleanedPayload.customerName) {
    return { ok: false, code: "customer_name_required", message: "Name is required." };
  }
  if (!cleanedPayload.phone) {
    return { ok: false, code: "phone_required", message: "Phone is required." };
  }
  if (!cleanedPayload.message) {
    return { ok: false, code: "message_required", message: "Message is required." };
  }
  if (cleanedPayload.message.length > 2000) {
    return { ok: false, code: "message_too_long", message: "Message must be 2,000 characters or fewer." };
  }

  try {
    const response = await fetch(`${baseUrl}/api/public/contact-enquiries`, {
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

function availableVehicles(vehicles: PublicVehicle[]): PublicVehicle[] {
  return vehicles.filter((vehicle) => vehicle.status === "Available");
}

function withFallbackVehiclePhotos(vehicle: PublicVehicle): PublicVehicle {
  const fallbackPhotoUrls = vehicleFallbackPhotoUrls(vehicle);
  return {
    ...vehicle,
    photoUrl: fallbackPhotoUrls[0] ?? vehicle.photoUrl,
    photoUrls: fallbackPhotoUrls,
    fallbackPhotoUrl: fallbackPhotoUrls[0] ?? vehicle.fallbackPhotoUrl,
    fallbackPhotoUrls
  };
}

function vehicleFallbackPhotoUrls(vehicle: VehiclePhotoIdentity) {
  return [neutralVehicleFallbackPhotoUrl];
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
