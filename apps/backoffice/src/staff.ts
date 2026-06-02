import type { CreateStaffUserRequest, ResetStaffPasswordRequest, StaffUser, UpdateStaffUserRequest } from "./api";
import { canAssignStaffRoles } from "./access";

export function staffCreateBlockReason(request: CreateStaffUserRequest, existing: StaffUser[] = []) {
  if (!request.email?.trim()) {
    return "Staff email is required.";
  }

  if (!request.displayName?.trim()) {
    return "Staff display name is required.";
  }

  if (!request.password?.trim()) {
    return "Initial password is required.";
  }

  if (!canAssignStaffRoles([request.role])) {
    return "Staff role must be one of the configured department roles.";
  }

  if (existing.some((staff) => staff.email.trim().toLowerCase() === request.email.trim().toLowerCase())) {
    return "Staff email already exists.";
  }

  return undefined;
}

export function staffUpdateBlockReason(request: UpdateStaffUserRequest) {
  if (!request.displayName?.trim()) {
    return "Staff display name is required.";
  }

  return undefined;
}

export function staffPasswordResetBlockReason(request: ResetStaffPasswordRequest) {
  if (!request.password?.trim()) {
    return "New password is required.";
  }

  if (request.password.trim().length < 8) {
    return "New password must be at least 8 characters.";
  }

  return undefined;
}
