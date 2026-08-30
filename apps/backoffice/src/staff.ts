import type { CreateStaffUserRequest, ResetStaffPasswordRequest, StaffRole, StaffUser, UpdateStaffUserRequest } from "./api";
import { canAssignStaffRoles } from "./access";

export type StaffStatusFilter = "All" | "Active" | "Disabled";

export type StaffUserFilters = {
  keyword?: string;
  status?: StaffStatusFilter;
  role?: StaffRole | "All";
};

export function filterStaffUsers(staffUsers: StaffUser[], filters: StaffUserFilters) {
  const keyword = filters.keyword?.trim().toLowerCase();
  const status = filters.status ?? "All";
  const role = filters.role ?? "All";

  return staffUsers.filter((staff) => {
    const searchable = [
      staff.displayName,
      staff.email,
      ...staff.roles,
      ...staff.roles.map(staffRoleSearchLabel)
    ].join(" ").toLowerCase();

    if (keyword && !searchable.includes(keyword)) return false;
    if (status === "Active" && !staff.isActive) return false;
    if (status === "Disabled" && staff.isActive) return false;
    if (role !== "All" && !staff.roles.includes(role)) return false;

    return true;
  });
}

function staffRoleSearchLabel(role: StaffRole) {
  if (role === "BossAdmin") return "Admin";
  if (role === "HrSalary") return "HR Payroll";
  return role;
}

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
