import type { Customer, Owner } from "./api";

export function customerCreateBlockReason(customer: Customer, existing: Customer[] = []) {
  if (!customer.name?.trim()) {
    return "Customer name is required.";
  }

  if (!customer.phone?.trim()) {
    return "Customer phone is required.";
  }

  if (existing.some((item) => item.id !== customer.id && normalizePhone(item.phone) === normalizePhone(customer.phone))) {
    return "Customer phone already exists.";
  }

  return undefined;
}

export function ownerCreateBlockReason(owner: Owner, existing: Owner[] = []) {
  if (!owner.name?.trim()) {
    return "Owner name is required.";
  }

  if (!owner.phone?.trim()) {
    return "Owner phone is required.";
  }

  if (existing.some((item) => item.id !== owner.id && normalizePhone(item.phone) === normalizePhone(owner.phone))) {
    return "Owner phone already exists.";
  }

  return undefined;
}

function normalizePhone(phone: string) {
  return phone.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
