import { useCallback, useEffect, useState } from "react";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { ProCard } from "@ant-design/pro-components";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import { Alert, Badge, Button, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Pagination, Select, Space, Switch, Table, Tabs, Tag, Tooltip, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TablePaginationConfig } from "antd/es/table/interface";
import { customerCreateBlockReason, ownerCreateBlockReason } from "../../contacts";
import { singaporeTodayIsoDate, type DashboardVehicleFocus } from "../../dashboard";
import { purchaseInvoiceCreateBlockReason, vehicleCreateBlockReason } from "../../vehicles";
import { MissingUploadReminder } from "../shared/MissingUploadReminder";
import { OcrUploadReview, type OcrReviewValues } from "../shared/OcrUploadReview";
import { MarketingDescription } from "../../../../frontoffice/app/vehicles/MarketingDescription";
import { formatMoney, formatMoneyInput, parseMoneyInput } from "../../money";
import {
  customerSelectLabel,
  getStockMovements,
  getVehicleDocuments,
  getVehicleOcrJobs,
  getVehiclePhotos,
  humanizeApiError,
  vehicleDocumentContentUrl,
  vehicleFromIntakeValues,
  vehiclePhotoContentUrl,
  type Customer,
  type DocumentCategory,
  type Lead,
  type LoanApplication,
  type Owner,
  type PurchaseInvoice,
  type StockMovement,
  type Vehicle,
  type VehicleDocument,
  type VehicleOcrJob,
  type VehiclePhoto
} from "../../api";

const maxWebsitePhotoBytes = 5 * 1024 * 1024;
const vehicleIntakeDocumentCategories: DocumentCategory[] = ["PurchaseInvoice", "Voc", "IdentityCard", "ApDocument"];
const mobileVehiclePageSize = 12;

export type OperationIntakeVehicleFilters = {
  keyword?: string;
  status?: Vehicle["status"];
  stockOwner?: Vehicle["stockOwner"];
  publicState?: "visible" | "hidden";
  approval?: "confirmed" | "pending";
  ownerLink?: "linked" | "missing";
  customerLink?: "linked" | "missing";
  outstationPickup?: "scheduled" | "none";
  invoiceLink?: "linked" | "missing";
  leadActivity?: "active" | "none";
};

export type VehicleLoanHandoffStep = "open-existing" | "select-buyer" | "confirm-start";

export type VehicleWorkflowState = {
  color: string;
  status: string;
  next: string;
  nextLabel: string;
  action: "none" | "publish" | "link-buyer" | "start-loan" | "open-loan";
};

export function vehicleLoanHandoffStep(vehicle: Pick<Vehicle, "status" | "customerId">): VehicleLoanHandoffStep {
  if (vehicle.status === "LoanProcessing") return "open-existing";
  return vehicle.customerId ? "confirm-start" : "select-buyer";
}

export function vehicleCustomerEditPolicy(vehicle: Pick<Vehicle, "id" | "customerId">, loans: LoanApplication[]) {
  const activeCustomerIds = Array.from(new Set(loans
    .filter((loan) => loan.vehicleId === vehicle.id && ["Pending", "Approved", "Done"].includes(loan.status))
    .map((loan) => loan.customerId)));
  return {
    locked: activeCustomerIds.length > 0 && Boolean(vehicle.customerId),
    allowedCustomerIds: vehicle.customerId ? [vehicle.customerId] : activeCustomerIds
  };
}

export function getVehicleWorkflowState(vehicle: Pick<Vehicle, "status" | "bossConfirmed" | "isPublic" | "customerId">): VehicleWorkflowState {
  if (vehicle.status === "Sold") {
    return {
      color: "purple",
      status: "Sale completed",
      next: "No more stock action needed. Keep finance and audit records complete.",
      nextLabel: "Completed",
      action: "none"
    };
  }

  if (vehicle.status === "LoanProcessing") {
    return {
      color: "blue",
      status: "Loan in progress",
      next: "Open the linked loan record to follow up documents, LOU approval, and completion.",
      nextLabel: "Open Loan",
      action: "open-loan"
    };
  }

  if (!vehicle.bossConfirmed) {
    return {
      color: "orange",
      status: "Waiting for management approval",
      next: "Open Details and approve the vehicle price before publishing or loan follow-up.",
      nextLabel: "Review Approval",
      action: "none"
    };
  }

  if (!vehicle.isPublic) {
    return {
      color: "gold",
      status: "Approved but hidden from website",
      next: "Publish when this car is ready to show on the public website.",
      nextLabel: "Publish to Website",
      action: "publish"
    };
  }

  if (!vehicle.customerId) {
    return {
      color: "gold",
      status: "Buyer needed for loan",
      next: "Link the confirmed buyer before moving this vehicle into loan processing.",
      nextLabel: "Link Buyer",
      action: "link-buyer"
    };
  }

  return {
    color: "green",
    status: "Ready stock on website",
    next: "The buyer is linked. Review and confirm the loan handoff when the sale proceeds.",
    nextLabel: "Start Loan",
    action: "start-loan"
  };
}

export function filterOperationIntakeVehicles(
  vehicles: Vehicle[],
  purchaseInvoices: PurchaseInvoice[],
  leads: Lead[],
  filters: OperationIntakeVehicleFilters
) {
  const keyword = filters.keyword?.trim().toLowerCase();
  const activeLeadVehicleIds = new Set(leads.filter((lead) => lead.status !== "Closed").map((lead) => lead.vehicleId));
  const invoiceVehicleIds = new Set(purchaseInvoices.map((invoice) => invoice.vehicleId));

  return vehicles.filter((vehicle) => {
    const searchable = [
      vehicle.plateNumber,
      vehicle.make,
      vehicle.model,
      String(vehicle.year),
      vehicle.stockOwner,
      vehicle.ucdStatus
    ].filter(Boolean).join(" ").toLowerCase();
    const hasOutstationPickup = Boolean(vehicle.outstationPickupScheduledAt || vehicle.outstationPickupAllowance || vehicle.outstationPickupBookingSlip);
    const hasInvoice = invoiceVehicleIds.has(vehicle.id);
    const hasActiveLead = activeLeadVehicleIds.has(vehicle.id);

    if (keyword && !searchable.includes(keyword)) return false;
    if (filters.status && vehicle.status !== filters.status) return false;
    if (filters.stockOwner && vehicle.stockOwner !== filters.stockOwner) return false;
    if (filters.publicState === "visible" && !vehicle.isPublic) return false;
    if (filters.publicState === "hidden" && vehicle.isPublic) return false;
    if (filters.approval === "confirmed" && !vehicle.bossConfirmed) return false;
    if (filters.approval === "pending" && vehicle.bossConfirmed) return false;
    if (filters.ownerLink === "linked" && !vehicle.ownerId) return false;
    if (filters.ownerLink === "missing" && vehicle.ownerId) return false;
    if (filters.customerLink === "linked" && !vehicle.customerId) return false;
    if (filters.customerLink === "missing" && vehicle.customerId) return false;
    if (filters.outstationPickup === "scheduled" && !hasOutstationPickup) return false;
    if (filters.outstationPickup === "none" && hasOutstationPickup) return false;
    if (filters.invoiceLink === "linked" && !hasInvoice) return false;
    if (filters.invoiceLink === "missing" && hasInvoice) return false;
    if (filters.leadActivity === "active" && !hasActiveLead) return false;
    if (filters.leadActivity === "none" && hasActiveLead) return false;

    return true;
  });
}

export function VehiclePage({
  vehicles,
  leads,
  loans,
  customers,
  owners,
  purchaseInvoices,
  canApproveVehicles,
  dashboardFocus,
  onClearDashboardFocus,
  onCreate,
  onUpdate,
  onStartLoan,
  onOpenCustomer,
  onCreateCustomer,
  onUpdateCustomer,
  onCreateOwner,
  onUpdateOwner,
  onCreatePurchaseInvoice,
  onUpdatePurchaseInvoice,
  onUploadPhoto,
  onUploadDocument
}: {
  vehicles: Vehicle[];
  leads: Lead[];
  loans: LoanApplication[];
  customers: Customer[];
  owners: Owner[];
  purchaseInvoices: PurchaseInvoice[];
  canApproveVehicles: boolean;
  dashboardFocus?: DashboardVehicleFocus;
  onClearDashboardFocus: () => void;
  onCreate: (vehicle: Vehicle) => void;
  onUpdate: (vehicle: Vehicle) => Promise<void>;
  onStartLoan: (vehicle: Vehicle) => Promise<void>;
  onOpenCustomer: (customerId: string) => void;
  onCreateCustomer: (customer: Customer) => Promise<void>;
  onUpdateCustomer: (customer: Customer) => void;
  onCreateOwner: (owner: Owner) => void;
  onUpdateOwner: (owner: Owner) => void;
  onCreatePurchaseInvoice: (invoice: PurchaseInvoice) => Promise<void>;
  onUpdatePurchaseInvoice: (invoice: PurchaseInvoice) => Promise<void>;
  onUploadPhoto: (vehicleId: string, file: File) => Promise<void>;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
}) {
  const [uploadVehicleId, setUploadVehicleId] = useState(vehicles[0]?.id ?? "");
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>("PurchaseInvoice");
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [ocrJobs, setOcrJobs] = useState<VehicleOcrJob[]>([]);
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [editVehicleId, setEditVehicleId] = useState(vehicles[0]?.id ?? "");
  const [editPurchaseInvoiceId, setEditPurchaseInvoiceId] = useState(purchaseInvoices[0]?.id ?? "");
  const [editCustomerId, setEditCustomerId] = useState(customers[0]?.id ?? "");
  const [editOwnerId, setEditOwnerId] = useState(owners[0]?.id ?? "");
  const [purchaseInvoiceEditorOpen, setPurchaseInvoiceEditorOpen] = useState(false);
  const [customerEditorOpen, setCustomerEditorOpen] = useState(false);
  const [ownerEditorOpen, setOwnerEditorOpen] = useState(false);
  const [vehicleDetailOpen, setVehicleDetailOpen] = useState(false);
  const [vehicleCreateOpen, setVehicleCreateOpen] = useState(false);
  const [purchaseInvoiceCreateOpen, setPurchaseInvoiceCreateOpen] = useState(false);
  const [purchaseInvoiceOcrDraft, setPurchaseInvoiceOcrDraft] = useState<OcrReviewValues | null>(null);
  const [customerCreateOpen, setCustomerCreateOpen] = useState(false);
  const [customerCreateForLoanVehicleId, setCustomerCreateForLoanVehicleId] = useState("");
  const [customerCreating, setCustomerCreating] = useState(false);
  const [ownerCreateOpen, setOwnerCreateOpen] = useState(false);
  const [loanHandoffVehicleId, setLoanHandoffVehicleId] = useState("");
  const [loanHandoffCustomerId, setLoanHandoffCustomerId] = useState("");
  const [loanHandoffSubmitting, setLoanHandoffSubmitting] = useState(false);
  const [loanHandoffForm] = Form.useForm<{ customerId: string }>();
  const [operationFilters, setOperationFilters] = useState<OperationIntakeVehicleFilters>({});
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [mobileVehiclePage, setMobileVehiclePage] = useState(1);
  const selectedVehicleId = uploadVehicleId || vehicles[0]?.id || "";
  const uploadDisabled = !selectedVehicleId;
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === editVehicleId) ?? vehicles[0];
  const selectedVehicleCustomerPolicy = selectedVehicle ? vehicleCustomerEditPolicy(selectedVehicle, loans) : { locked: false, allowedCustomerIds: [] };
  const selectedVehicleCustomerOptions = selectedVehicleCustomerPolicy.allowedCustomerIds.length > 0
    ? customers.filter((customer) => selectedVehicleCustomerPolicy.allowedCustomerIds.includes(customer.id))
    : customers;
  const selectedPurchaseInvoice = purchaseInvoices.find((invoice) => invoice.id === editPurchaseInvoiceId) ?? purchaseInvoices[0];
  const selectedCustomer = customers.find((customer) => customer.id === editCustomerId) ?? customers[0];
  const selectedOwner = owners.find((owner) => owner.id === editOwnerId) ?? owners[0];
  const selectedVehicleInvoices = selectedVehicle ? purchaseInvoices.filter((invoice) => invoice.vehicleId === selectedVehicle.id) : [];
  const selectedVehicleLeads = selectedVehicle ? leads.filter((lead) => lead.vehicleId === selectedVehicle.id) : [];
  const selectedVehicleActiveLeads = selectedVehicleLeads.filter((lead) => lead.status !== "Closed");
  const selectedVehicleCustomer = selectedVehicle?.customerId ? customers.find((customer) => customer.id === selectedVehicle.customerId) : undefined;
  const selectedVehicleOwner = selectedVehicle?.ownerId ? owners.find((owner) => owner.id === selectedVehicle.ownerId) : undefined;
  const loanHandoffVehicle = vehicles.find((vehicle) => vehicle.id === loanHandoffVehicleId);
  const loanHandoffStep = loanHandoffVehicle ? vehicleLoanHandoffStep(loanHandoffVehicle) : undefined;
  const availableVehicles = vehicles.filter((vehicle) => vehicle.status === "Available").length;
  const publicVehicles = vehicles.filter((vehicle) => vehicle.isPublic).length;
  const pendingBossConfirmation = vehicles.filter((vehicle) => !vehicle.bossConfirmed).length;
  const dashboardFocusedVehicles = dashboardFocus === "stock"
    ? vehicles.filter((vehicle) => vehicle.status !== "Sold")
    : dashboardFocus === "aging"
      ? vehicles.filter((vehicle) => vehicleAgeInDays(vehicle, singaporeTodayIsoDate()) > 60)
      : vehicles;
  const filteredVehicles = filterOperationIntakeVehicles(dashboardFocusedVehicles, purchaseInvoices, leads, operationFilters)
    .sort((left, right) => dashboardFocus === "profit" ? estimatedVehicleProfit(right) - estimatedVehicleProfit(left) : 0);
  const mobileVehiclePageCount = Math.max(1, Math.ceil(filteredVehicles.length / mobileVehiclePageSize));
  const clampedMobileVehiclePage = Math.min(mobileVehiclePage, mobileVehiclePageCount);
  const mobileVehicles = filteredVehicles.slice((clampedMobileVehiclePage - 1) * mobileVehiclePageSize, clampedMobileVehiclePage * mobileVehiclePageSize);
  const filterActive = Object.values(operationFilters).some((value) => value !== undefined && value !== "");
  const advancedFilterCount = [
    operationFilters.stockOwner,
    operationFilters.publicState,
    operationFilters.ownerLink,
    operationFilters.customerLink,
    operationFilters.invoiceLink,
    operationFilters.outstationPickup,
    operationFilters.leadActivity
  ].filter(Boolean).length;
  const selectedVehicleProfit = selectedVehicle
    ? estimatedVehicleProfit(selectedVehicle)
    : 0;
  const selectedWorkflow = selectedVehicle ? getVehicleWorkflowState(selectedVehicle) : undefined;
  const selectedVehicleInvoiceCount = selectedVehicleInvoices.length;
  const selectedVehicleDocumentCount = documents.length;
  const selectedVehicleCaptureCount = ocrJobs.length;
  const selectedVehiclePhotoCount = photos.length;
  const selectedVehicleMissingDocuments = vehicleIntakeDocumentCategories.filter((category) => !documents.some((document) => document.category === category));
  const selectedVehicleUploadReminders = [
    ...vehicleIntakeDocumentCategories.map((category) => ({
      label: documentCategoryLabel(category),
      isPresent: !selectedVehicleMissingDocuments.includes(category)
    })),
    { label: "Website photos", isPresent: selectedVehiclePhotoCount > 0 }
  ];
  const selectedVehicleHasOutstationPickup = selectedVehicle ? hasOutstationPickup(selectedVehicle) : false;
  const vehicleOptions = vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }));
  const selectedApprovalGaps = selectedVehicle
    ? [
        selectedVehicle.bossConfirmed ? "" : "Management approval pending",
        selectedVehicle.ownerId ? "" : "Owner not linked",
        selectedVehicleInvoiceCount > 0 ? "" : "Purchase invoice missing",
        selectedVehicle.contraRangePrice ? "" : "Contra range not set",
        selectedVehicle.ucdStatus ? "" : "UCD status not tracked",
        selectedVehicle.status === "Available" && !selectedVehicle.isPublic ? "Website hidden" : ""
      ].filter(Boolean)
    : [];
  const photoPreviewGrid = (
    <div className="vehiclePhotoPreviewGrid">
      {photos.length > 0 ? photos.map((photo) => (
        <a
          className="vehiclePhotoPreviewCard"
          href={vehiclePhotoContentUrl(selectedVehicleId, photo.id)}
          key={photo.id}
          target="_blank"
          rel="noreferrer"
        >
          <div className="vehiclePhotoPreviewThumb">
            <UploadOutlined />
            <img
              src={vehiclePhotoContentUrl(selectedVehicleId, photo.id)}
              alt={photo.fileName}
              loading="lazy"
              onLoad={(event) => {
                event.currentTarget.dataset.loaded = "true";
              }}
              onError={(event) => {
                event.currentTarget.remove();
              }}
            />
          </div>
          <span>{photo.fileName}</span>
        </a>
      )) : (
        <div className="vehiclePhotoEmpty">
          <UploadOutlined />
          <span>No website photos uploaded yet.</span>
        </div>
      )}
    </div>
  );
  const vehicleStatusColor: Record<Vehicle["status"], string> = {
    Available: "green",
    LoanProcessing: "blue",
    Sold: "purple"
  };
  const vehicleName = (vehicle: Vehicle) => `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const operationFilterOptions = {
    status: ["Available", "LoanProcessing", "Sold"].map((value) => ({ value, label: value })),
    stockOwner: ["YSHeng", "KS"].map((value) => ({ value, label: value })),
    publicState: [{ value: "visible", label: "Visible" }, { value: "hidden", label: "Hidden" }],
    approval: [{ value: "confirmed", label: "Confirmed" }, { value: "pending", label: "Pending" }],
    ownerLink: [{ value: "linked", label: "Owner linked" }, { value: "missing", label: "Owner missing" }],
    customerLink: [{ value: "linked", label: "Customer linked" }, { value: "missing", label: "Customer missing" }],
    outstationPickup: [{ value: "scheduled", label: "Pickup scheduled" }, { value: "none", label: "No pickup" }],
    invoiceLink: [{ value: "linked", label: "Invoice linked" }, { value: "missing", label: "Invoice missing" }],
    leadActivity: [{ value: "active", label: "Active leads" }, { value: "none", label: "No active leads" }]
  };
  const updateOperationFilter = <K extends keyof OperationIntakeVehicleFilters>(key: K, value: OperationIntakeVehicleFilters[K] | undefined) => {
    setMobileVehiclePage(1);
    setOperationFilters((current) => ({ ...current, [key]: value || undefined }));
  };
  const textFilters = (values: Array<string | undefined | null>) =>
    Array.from(new Set(values.filter((value): value is string => Boolean(value))))
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ text: value, value }));

  const selectVehicle = (vehicleId: string) => {
    setEditVehicleId(vehicleId);
    setUploadVehicleId(vehicleId);
  };

  const openVehicleDetails = (vehicleId: string) => {
    selectVehicle(vehicleId);
    setVehicleDetailOpen(true);
  };

  const closeLoanHandoff = () => {
    setLoanHandoffVehicleId("");
    setLoanHandoffCustomerId("");
  };

  const handleStartLoan = (vehicle: Vehicle) => {
    if (vehicleLoanHandoffStep(vehicle) === "open-existing") {
      void onStartLoan(vehicle);
      return;
    }

    selectVehicle(vehicle.id);
    setLoanHandoffCustomerId(vehicle.customerId ?? "");
    setLoanHandoffVehicleId(vehicle.id);
  };

  useEffect(() => {
    if (!loanHandoffVehicle) return;
    loanHandoffForm.setFieldsValue({ customerId: loanHandoffCustomerId || loanHandoffVehicle.customerId });
  }, [loanHandoffCustomerId, loanHandoffForm, loanHandoffVehicle]);

  const openCustomerCreateForLoan = (vehicleId: string) => {
    closeLoanHandoff();
    setCustomerCreateForLoanVehicleId(vehicleId);
    setCustomerCreateOpen(true);
  };

  const submitLoanHandoff = async ({ customerId }: { customerId: string }) => {
    if (!loanHandoffVehicle) return;

    const preparedVehicle = { ...loanHandoffVehicle, customerId };
    setLoanHandoffSubmitting(true);
    try {
      await onStartLoan(preparedVehicle);
      closeLoanHandoff();
    } catch {
      // The parent surfaces the API error. Keep this dialog open so staff can correct or retry the handoff.
    } finally {
      setLoanHandoffSubmitting(false);
    }
  };

  const renderVehicleNextAction = (vehicle: Vehicle) => {
    const workflow = getVehicleWorkflowState(vehicle);
    if (workflow.action === "none") return null;

    if (workflow.action === "open-loan") {
      return (
        <Button size="small" onClick={() => handleStartLoan(vehicle)}>
          Open Loan
        </Button>
      );
    }

    if (workflow.action === "publish") {
      return (
        <Button
          size="small"
          onClick={() => onUpdate({ ...vehicle, status: "Available", isPublic: true })}
          disabled={!vehicle.bossConfirmed}
        >
          {workflow.nextLabel}
        </Button>
      );
    }

    return <Button size="small" onClick={() => handleStartLoan(vehicle)}>{workflow.nextLabel}</Button>;
  };

  const renderVehicleActions = (vehicle: Vehicle) => (
    <Space className="tableActionGroup vehicleActionGroup" wrap size={6}>
      <Button size="small" type="primary" onClick={() => openVehicleDetails(vehicle.id)}>Details</Button>
      {renderVehicleNextAction(vehicle)}
    </Space>
  );

  const selectPurchaseInvoice = (invoiceId: string) => {
    setEditPurchaseInvoiceId(invoiceId);
    setPurchaseInvoiceEditorOpen(true);
  };

  const selectCustomer = (customerId: string) => {
    setEditCustomerId(customerId);
    setCustomerEditorOpen(true);
  };

  const selectOwner = (ownerId: string) => {
    setEditOwnerId(ownerId);
    setOwnerEditorOpen(true);
  };

  const loadUploads = useCallback(async () => {
    if (!selectedVehicleId) {
      setDocuments([]);
      setOcrJobs([]);
      setPhotos([]);
      setStockMovements([]);
      return;
    }
    const [photoData, documentData, ocrJobData, movementData] = await Promise.all([
      getVehiclePhotos(selectedVehicleId),
      getVehicleDocuments(selectedVehicleId),
      getVehicleOcrJobs(selectedVehicleId),
      getStockMovements(selectedVehicleId)
    ]);
    setPhotos(photoData);
    setDocuments(documentData);
    setOcrJobs(ocrJobData);
    setStockMovements(movementData);
  }, [selectedVehicleId]);

  useEffect(() => {
    if (!uploadVehicleId && vehicles[0]?.id) {
      setUploadVehicleId(vehicles[0].id);
    }
  }, [uploadVehicleId, vehicles]);

  useEffect(() => {
    if (!editVehicleId && vehicles[0]?.id) {
      setEditVehicleId(vehicles[0].id);
    }
  }, [editVehicleId, vehicles]);

  useEffect(() => {
    if (!editPurchaseInvoiceId && purchaseInvoices[0]?.id) {
      setEditPurchaseInvoiceId(purchaseInvoices[0].id);
    }
  }, [editPurchaseInvoiceId, purchaseInvoices]);

  useEffect(() => {
    if (!editCustomerId && customers[0]?.id) {
      setEditCustomerId(customers[0].id);
    }
  }, [editCustomerId, customers]);

  useEffect(() => {
    if (!editOwnerId && owners[0]?.id) {
      setEditOwnerId(owners[0].id);
    }
  }, [editOwnerId, owners]);

  useEffect(() => {
    if (mobileVehiclePage !== clampedMobileVehiclePage) {
      setMobileVehiclePage(clampedMobileVehiclePage);
    }
  }, [clampedMobileVehiclePage, mobileVehiclePage]);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  const columns: ColumnsType<Vehicle> = [
    {
      title: "Plate / 车牌",
      dataIndex: "plateNumber",
      sorter: (a, b) => a.plateNumber.localeCompare(b.plateNumber),
      filters: textFilters(vehicles.map((vehicle) => vehicle.plateNumber)),
      filterSearch: true,
      onFilter: (value, row) => row.plateNumber === value
    },
    {
      title: "Vehicle / 车辆",
      render: (_, row) => vehicleName(row),
      sorter: (a, b) => vehicleName(a).localeCompare(vehicleName(b)),
      filters: textFilters(vehicles.map(vehicleName)),
      filterSearch: true,
      onFilter: (value, row) => vehicleName(row) === value
    },
    {
      title: "Customer / 客户",
      dataIndex: "customerId",
      render: (customerId) => contactFor(customers, customerId),
      filters: textFilters(vehicles.map((vehicle) => contactFor(customers, vehicle.customerId))),
      filterSearch: true,
      onFilter: (value, row) => contactFor(customers, row.customerId) === value
    },
    {
      title: "Owner / 原车主",
      dataIndex: "ownerId",
      render: (ownerId) => contactFor(owners, ownerId),
      filters: textFilters(vehicles.map((vehicle) => contactFor(owners, vehicle.ownerId))),
      filterSearch: true,
      onFilter: (value, row) => contactFor(owners, row.ownerId) === value
    },
    {
      title: "Outstation Pickup / 外地收车",
      render: (_, row) => row.outstationPickupScheduledAt || row.outstationPickupAllowance || row.outstationPickupBookingSlip
        ? (
          <Space direction="vertical" size={0}>
            <span>{row.outstationPickupScheduledAt ? String(row.outstationPickupScheduledAt).replace("T", " ").slice(0, 16) : "No schedule"}</span>
            <span>{formatMoney(row.outstationPickupAllowance ?? 0)} / {row.outstationPickupBookingSlip || "No slip"}</span>
          </Space>
        )
        : "-"
    },
    {
      title: "Status / 状态",
      dataIndex: "status",
      filters: ["Available", "LoanProcessing", "Sold"].map((value) => ({ text: value, value })),
      onFilter: (value, row) => row.status === value,
      render: (status: Vehicle["status"]) => <Tag color={vehicleStatusColor[status]}>{status}</Tag>
    },
    {
      title: "Management Approval / 管理层审批",
      dataIndex: "bossConfirmed",
      filters: [{ text: "Confirmed", value: true }, { text: "Pending", value: false }],
      onFilter: (value, row) => row.bossConfirmed === value,
      render: (value) => <Badge status={value ? "success" : "warning"} text={value ? "Confirmed" : "Pending"} />
    },
    { title: "Contra Range / Contra 价格", dataIndex: "contraRangePrice", render: (value) => `RM ${Number(value ?? 0).toLocaleString()}` },
    { title: shortformLabel("UCD Status", "Used car department status tracking"), dataIndex: "ucdStatus", render: (value) => value || "-" },
    {
      title: "Public / 网站",
      dataIndex: "isPublic",
      filters: [{ text: "Visible", value: true }, { text: "Hidden", value: false }],
      onFilter: (value, row) => row.isPublic === value,
      render: (value) => <Badge status={value ? "success" : "default"} text={value ? "Visible" : "Hidden"} />
    },
    { title: "Selling / 售价", dataIndex: "sellingPrice", sorter: (a, b) => a.sellingPrice - b.sellingPrice, render: (value) => formatMoney(value) },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 360,
      render: (_, row) => renderVehicleActions(row)
    }
  ];
  const invoiceCountForVehicle = (vehicleId: string) => purchaseInvoices.filter((invoice) => invoice.vehicleId === vehicleId).length;
  const activeLeadCountForVehicle = (vehicleId: string) => leads.filter((lead) => lead.vehicleId === vehicleId && lead.status !== "Closed").length;

  const operationIntakeColumns: ColumnsType<Vehicle> = [
    {
      title: "Plate / 车牌",
      dataIndex: "plateNumber",
      fixed: "left",
      width: 130,
      sorter: (a, b) => a.plateNumber.localeCompare(b.plateNumber),
      filters: textFilters(vehicles.map((vehicle) => vehicle.plateNumber)),
      filterSearch: true,
      onFilter: (value, row) => row.plateNumber === value
    },
    {
      title: "Vehicle / 车辆",
      width: 180,
      render: (_, row) => vehicleName(row),
      sorter: (a, b) => vehicleName(a).localeCompare(vehicleName(b)),
      filters: textFilters(vehicles.map(vehicleName)),
      filterSearch: true,
      onFilter: (value, row) => vehicleName(row) === value
    },
    {
      title: "Stock Owner / 库存方",
      dataIndex: "stockOwner",
      width: 130,
      filters: textFilters(vehicles.map((vehicle) => vehicle.stockOwner)),
      onFilter: (value, row) => row.stockOwner === value,
      render: (value: Vehicle["stockOwner"]) => <Tag color={value === "YSHeng" ? "green" : "blue"}>{value}</Tag>
    },
    {
      title: "Owner / 原车主",
      dataIndex: "ownerId",
      width: 190,
      render: (ownerId) => contactFor(owners, ownerId),
      filters: textFilters(vehicles.map((vehicle) => contactFor(owners, vehicle.ownerId))),
      filterSearch: true,
      onFilter: (value, row) => contactFor(owners, row.ownerId) === value
    },
    {
      title: "Buyer / 买家",
      dataIndex: "customerId",
      width: 180,
      render: (customerId) => contactFor(customers, customerId),
      filters: textFilters(vehicles.map((vehicle) => contactFor(customers, vehicle.customerId))),
      filterSearch: true,
      onFilter: (value, row) => contactFor(customers, row.customerId) === value
    },
    {
      title: "Purchase / 收车价",
      dataIndex: "purchasePrice",
      width: 130,
      sorter: (a, b) => a.purchasePrice - b.purchasePrice,
      render: (value) => formatMoney(Number(value ?? 0))
    },
    {
      title: "Selling / 售价",
      dataIndex: "sellingPrice",
      width: 130,
      sorter: (a, b) => a.sellingPrice - b.sellingPrice,
      render: (value) => formatMoney(Number(value ?? 0))
    },
    {
      title: "Est. Profit / 预估利润",
      width: 140,
      sorter: (a, b) => estimatedVehicleProfit(a) - estimatedVehicleProfit(b),
      render: (_, row) => formatMoney(estimatedVehicleProfit(row))
    },
    {
      title: "Invoice / 发票",
      width: 120,
      filters: [{ text: "Linked", value: "linked" }, { text: "Missing", value: "missing" }],
      onFilter: (value, row) => value === "linked" ? invoiceCountForVehicle(row.id) > 0 : invoiceCountForVehicle(row.id) === 0,
      render: (_, row) => {
        const count = invoiceCountForVehicle(row.id);
        return <Badge status={count > 0 ? "success" : "warning"} text={count > 0 ? `${count} linked` : "Missing"} />;
      }
    },
    {
      title: "Active Leads / 线索",
      width: 120,
      sorter: (a, b) => activeLeadCountForVehicle(a.id) - activeLeadCountForVehicle(b.id),
      render: (_, row) => {
        const count = activeLeadCountForVehicle(row.id);
        return <Tag color={count > 0 ? "green" : "default"}>{count}</Tag>;
      }
    },
    {
      title: "Status / 状态",
      dataIndex: "status",
      width: 150,
      filters: ["Available", "LoanProcessing", "Sold"].map((value) => ({ text: value, value })),
      onFilter: (value, row) => row.status === value,
      render: (status: Vehicle["status"]) => <Tag color={vehicleStatusColor[status]}>{status}</Tag>
    },
    {
      title: "Readiness / 收车状态",
      width: 220,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Badge status={row.bossConfirmed ? "success" : "warning"} text={row.bossConfirmed ? "Approved" : "Approval pending"} />
          <Badge status={row.isPublic ? "success" : "default"} text={row.isPublic ? "Website visible" : "Website hidden"} />
          <span>{row.ucdStatus ? `UCD: ${row.ucdStatus}` : "UCD not tracked"}</span>
        </Space>
      )
    },
    {
      title: "Outstation / 外地",
      width: 210,
      filters: [{ text: "Scheduled", value: "scheduled" }, { text: "None", value: "none" }],
      onFilter: (value, row) => value === "scheduled" ? hasOutstationPickup(row) : !hasOutstationPickup(row),
      render: (_, row) => hasOutstationPickup(row)
        ? (
          <Space direction="vertical" size={0}>
            <span>{row.outstationPickupScheduledAt ? String(row.outstationPickupScheduledAt).replace("T", " ").slice(0, 16) : "No schedule"}</span>
            <span>{formatMoney(row.outstationPickupAllowance ?? 0)} / {row.outstationPickupBookingSlip || "No slip"}</span>
          </Space>
        )
        : "-"
    },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 360,
      render: (_, row) => renderVehicleActions(row)
    }
  ];

  const compactOperationIntakeColumns: ColumnsType<Vehicle> = [
    {
      title: "Plate / 车牌",
      dataIndex: "plateNumber",
      fixed: "left",
      width: 130,
      sorter: (a, b) => a.plateNumber.localeCompare(b.plateNumber),
      filters: textFilters(vehicles.map((vehicle) => vehicle.plateNumber)),
      filterSearch: true,
      onFilter: (value, row) => row.plateNumber === value
    },
    {
      title: "Vehicle / 车辆",
      width: 230,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{vehicleName(row)}</Typography.Text>
          <Tag color={row.stockOwner === "YSHeng" ? "green" : "blue"}>{row.stockOwner}</Tag>
        </Space>
      ),
      sorter: (a, b) => vehicleName(a).localeCompare(vehicleName(b)),
      filters: textFilters(vehicles.map(vehicleName)),
      filterSearch: true,
      onFilter: (value, row) => vehicleName(row) === value
    },
    {
      title: "Contacts / 联系人",
      width: 240,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>Owner: {contactFor(owners, row.ownerId)}</Typography.Text>
          <Typography.Text type="secondary">Buyer: {contactFor(customers, row.customerId)}</Typography.Text>
        </Space>
      )
    },
    {
      title: "Pricing / 金额",
      width: 170,
      sorter: (a, b) => estimatedVehicleProfit(a) - estimatedVehicleProfit(b),
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>Sell RM {Number(row.sellingPrice ?? 0).toLocaleString()}</Typography.Text>
          <Typography.Text type="secondary">Profit RM {estimatedVehicleProfit(row).toLocaleString()}</Typography.Text>
        </Space>
      )
    },
    {
      title: "Status / 状态",
      dataIndex: "status",
      width: 150,
      filters: ["Available", "LoanProcessing", "Sold"].map((value) => ({ text: value, value })),
      onFilter: (value, row) => row.status === value,
      render: (status: Vehicle["status"]) => <Tag color={vehicleStatusColor[status]}>{status}</Tag>
    },
    {
      title: "Ready / 准备",
      width: 190,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Badge status={row.bossConfirmed ? "success" : "warning"} text={row.bossConfirmed ? "Approved" : "Approval pending"} />
          <Badge status={row.isPublic ? "success" : "default"} text={row.isPublic ? "Website visible" : "Website hidden"} />
          <Badge status={invoiceCountForVehicle(row.id) > 0 ? "success" : "warning"} text={invoiceCountForVehicle(row.id) > 0 ? "Invoice linked" : "Invoice missing"} />
          <Badge status={row.customerId ? "success" : "warning"} text={row.customerId ? "Buyer linked" : "Buyer not linked"} />
        </Space>
      )
    },
    {
      title: "Leads / 线索",
      width: 100,
      sorter: (a, b) => activeLeadCountForVehicle(a.id) - activeLeadCountForVehicle(b.id),
      render: (_, row) => {
        const count = activeLeadCountForVehicle(row.id);
        return <Tag color={count > 0 ? "green" : "default"}>{count}</Tag>;
      }
    },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 220,
      render: (_, row) => renderVehicleActions(row)
    }
  ];

  const documentColumns: ColumnsType<VehicleDocument> = [
    { title: "Uploaded / 日期", dataIndex: "uploadedAt", render: (value) => String(value).slice(0, 10) },
    {
      title: "Type / 类型",
      dataIndex: "category",
      filters: textFilters(documents.map((document) => document.category)),
      onFilter: (value, row) => row.category === value
    },
    {
      title: "File / 文件",
      dataIndex: "fileName",
      filters: textFilters(documents.map((document) => document.fileName)),
      filterSearch: true,
      onFilter: (value, row) => row.fileName === value
    },
    {
      title: "Uploaded By / 上传者",
      dataIndex: "uploadedBy",
      filters: textFilters(documents.map((document) => document.uploadedBy || "System")),
      filterSearch: true,
      onFilter: (value, row) => (row.uploadedBy || "System") === value,
      render: (value) => value || "-"
    },
    { title: "Checksum / 校验", dataIndex: "checksum", render: (value) => value ? `${String(value).slice(0, 12)}...` : "-" },
    {
      title: "Download / 下载",
      render: (_, row) => (
        <Button
          size="small"
          icon={<DownloadOutlined />}
          href={vehicleDocumentContentUrl(selectedVehicleId, row.id)}
          target="_blank"
        >
          Open
        </Button>
      )
    }
  ];
  const ocrColumns: ColumnsType<VehicleOcrJob> = [
    { title: "Captured / 日期", dataIndex: "createdAt", render: (value) => String(value).slice(0, 10) },
    { title: "Type / 类型", dataIndex: "category", render: (value) => <Tag>{value}</Tag> },
    { title: "File / 文件", render: (_, row) => row.document?.fileName ?? "-" },
    { title: "Plate / 车牌", render: (_, row) => ocrField(row, "plateNumber") || "-" },
    { title: "Invoice / Receipt", render: (_, row) => ocrField(row, "invoiceNumber") || ocrField(row, "receiptNumber") || "-" },
    { title: "Amount / 金额", render: (_, row) => ocrAmount(row) },
    { title: "Bank", render: (_, row) => ocrField(row, "bankName") || "-" },
    {
      title: "Confidence",
      width: 120,
      render: (_, row) => (
        <Tag color={(row.result?.confidence ?? 0) >= 0.75 ? "green" : "orange"}>
          {Math.round((row.result?.confidence ?? 0) * 100)}%
        </Tag>
      )
    },
    {
      title: "Status / 状态",
      render: (_, row) => (
        <Space wrap size={4}>
          <Tag color={row.status === "NeedsReview" ? "blue" : row.status === "Failed" ? "red" : "orange"}>{row.status}</Tag>
          {row.warnings?.length ? <Tooltip title={row.warnings.join(" ")}><Tag color="orange">Warning</Tag></Tooltip> : null}
        </Space>
      )
    }
  ];
  const photoColumns: ColumnsType<VehiclePhoto> = [
    { title: "Uploaded / 日期", dataIndex: "uploadedAt", render: (value) => String(value).slice(0, 10) },
    {
      title: "File / 文件",
      dataIndex: "fileName",
      filters: textFilters(photos.map((photo) => photo.fileName)),
      filterSearch: true,
      onFilter: (value, row) => row.fileName === value
    },
    {
      title: "MIME",
      dataIndex: "mimeType",
      filters: textFilters(photos.map((photo) => photo.mimeType)),
      onFilter: (value, row) => row.mimeType === value
    },
    {
      title: "Uploaded By / 上传者",
      dataIndex: "uploadedBy",
      filters: textFilters(photos.map((photo) => photo.uploadedBy || "System")),
      filterSearch: true,
      onFilter: (value, row) => (row.uploadedBy || "System") === value,
      render: (value) => value || "-"
    },
    { title: "Checksum / 校验", dataIndex: "checksum", render: (value) => value ? `${String(value).slice(0, 12)}...` : "-" },
    {
      title: "Preview / 预览",
      render: (_, row) => (
        <Button
          size="small"
          icon={<DownloadOutlined />}
          href={vehiclePhotoContentUrl(selectedVehicleId, row.id)}
          target="_blank"
        >
          Open
        </Button>
      )
    }
  ];

  const documentMobileCards = (
    <div className="mobileRecordList vehicleDocumentMobileList">
      {documents.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No documents uploaded yet" />}
      {documents.map((document) => (
        <article className="mobileRecordCard" key={document.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">Document</Typography.Text>
              <Typography.Title level={5}>{document.fileName}</Typography.Title>
            </div>
            <Tag>{document.category}</Tag>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Uploaded</span><strong>{String(document.uploadedAt).slice(0, 10)}</strong></div>
            <div><span>Uploaded By</span><strong>{document.uploadedBy || "System"}</strong></div>
          </div>
          <div className="mobileRecordSection">
            <Typography.Text className="mobileRecordLabel">Checksum</Typography.Text>
            <div className="mobileRecordTextBlock"><span>{document.checksum ? `${String(document.checksum).slice(0, 18)}...` : "-"}</span></div>
          </div>
          <div className="mobileRecordFooter">
            <Button
              size="small"
              icon={<DownloadOutlined />}
              href={vehicleDocumentContentUrl(selectedVehicleId, document.id)}
              target="_blank"
            >
              Open Document
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
  const ocrMobileCards = (
    <div className="mobileRecordList vehicleOcrMobileList">
      {ocrJobs.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No captured receipt or invoice data yet" />}
      {ocrJobs.map((job) => (
        <article className="mobileRecordCard" key={job.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">Captured Data</Typography.Text>
              <Typography.Title level={5}>{job.document?.fileName ?? job.category}</Typography.Title>
            </div>
            <Tag>{job.category}</Tag>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Plate</span><strong>{ocrField(job, "plateNumber") || "-"}</strong></div>
            <div><span>Invoice / Receipt</span><strong>{ocrField(job, "invoiceNumber") || ocrField(job, "receiptNumber") || "-"}</strong></div>
            <div><span>Amount</span><strong>{ocrAmount(job)}</strong></div>
            <div><span>Confidence</span><strong>{Math.round((job.result?.confidence ?? 0) * 100)}%</strong></div>
          </div>
          <div className="mobileRecordSection">
            <Typography.Text className="mobileRecordLabel">Raw Text</Typography.Text>
            <div className="mobileRecordTextBlock"><span>{job.result?.rawText || "-"}</span></div>
          </div>
          <div className="mobileRecordFooter">
            <Space wrap size={6}>
              <Tag color={job.status === "NeedsReview" ? "blue" : job.status === "Failed" ? "red" : "orange"}>{job.status}</Tag>
              {job.warnings?.length ? <Tag color="orange">Warning</Tag> : null}
            </Space>
          </div>
        </article>
      ))}
    </div>
  );
  const customerColumns: ColumnsType<Customer> = [
    { title: "Name / 姓名", dataIndex: "name" },
    { title: "Phone / 电话", dataIndex: "phone" },
    { title: shortformLabel("IC", "Identity card number"), dataIndex: "icNumber", render: (value) => value || "-" },
    { title: "Email", dataIndex: "email", render: (value) => value || "-" },
    { title: "Address / 地址", dataIndex: "address", render: (value) => value || "-" },
    { title: "Notes / 备注", dataIndex: "notes", render: (value) => value || "-" },
    { title: "Action", fixed: "right", width: 120, render: (_, row) => <Space className="tableActionGroup" wrap size={6}><Button size="small" type="primary" onClick={() => selectCustomer(row.id)}>Details</Button></Space> }
  ];
  const ownerColumns: ColumnsType<Owner> = [
    { title: "Owner / 原车主", dataIndex: "name" },
    { title: "Phone / 电话", dataIndex: "phone" },
    { title: "Action", fixed: "right", width: 120, render: (_, row) => <Space className="tableActionGroup" wrap size={6}><Button size="small" type="primary" onClick={() => selectOwner(row.id)}>Details</Button></Space> }
  ];
  const purchaseInvoiceColumns: ColumnsType<PurchaseInvoice> = [
    { title: "Car Plate", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Invoice", dataIndex: "invoiceNumber" },
    { title: "Amount", dataIndex: "amount", render: (value) => formatMoney(value) },
    { title: "Action", fixed: "right", width: 120, render: (_, row) => <Space className="tableActionGroup" wrap size={6}><Button size="small" type="primary" onClick={() => selectPurchaseInvoice(row.id)}>Details</Button></Space> }
  ];
  return (
    <Space direction="vertical" size={16} className="fullWidth vehiclesPage">
      <ProCard
        title="Vehicle Inventory / 车辆库存"
        extra={<Space><Tag color="green">{vehicles.length} vehicles</Tag><Button type="primary" onClick={() => setVehicleCreateOpen(true)}>New Vehicle</Button></Space>}
      >
        {dashboardFocus && <Alert
          type="info"
          showIcon
          message={dashboardFocus === "stock" ? "Dashboard focus: current stock" : dashboardFocus === "aging" ? "Dashboard focus: stock aged more than 60 days" : "Dashboard focus: vehicles ordered by estimated profit"}
          action={<Button size="small" onClick={onClearDashboardFocus}>Clear focus</Button>}
        />}
        <div className="vehicleInventoryHeader">
          <div>
            <Typography.Text className="moduleEyebrow">Inventory control</Typography.Text>
            <Typography.Title level={3}>Vehicle list with approval state</Typography.Title>
            <Typography.Text type="secondary">Open details to maintain the vehicle record, invoices, contacts, photos, and documents.</Typography.Text>
          </div>
          <div className="vehicleMiniStats">
            <span><strong>{availableVehicles}</strong>Available</span>
            <span><strong>{publicVehicles}</strong>Public</span>
            <span><strong>{pendingBossConfirmation}</strong>Pending approval</span>
          </div>
        </div>
        <div className="vehicleSelectedSummary">
          {selectedVehicle ? (
            <>
              <div className="vehicleSelectedIdentity">
                <Typography.Text className="moduleEyebrow">Selected vehicle</Typography.Text>
                <Typography.Title level={4}>
                  {`${selectedVehicle.plateNumber} - ${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`}
                </Typography.Title>
                <Space wrap>
                  <Tag color={vehicleStatusColor[selectedVehicle.status]}>{selectedWorkflow?.status}</Tag>
                  <Tag color={selectedWorkflow?.action === "none" ? "green" : "gold"}>Next: {selectedWorkflow?.nextLabel}</Tag>
                </Space>
              </div>
              <div className="vehicleSelectedFacts">
                <span>
                  <small>Management</small>
                  <strong>{selectedVehicle.bossConfirmed ? "Confirmed" : "Pending"}</strong>
                </span>
                <span>
                  <small>Website</small>
                  <strong>{selectedVehicle.isPublic ? "Visible" : "Hidden"}</strong>
                </span>
                <span>
                  <small>Active leads</small>
                  <strong>{selectedVehicleActiveLeads.length}</strong>
                </span>
                <span>
                  <small>Owner</small>
                  <strong>{selectedVehicle.ownerId ? "Linked" : "Missing"}</strong>
                </span>
                <span>
                  <small>Invoice</small>
                  <strong>{selectedVehicleInvoiceCount > 0 ? `${selectedVehicleInvoiceCount} linked` : "Missing"}</strong>
                </span>
                <span>
                  <small>Photos / Docs</small>
                  <strong>{selectedVehiclePhotoCount} / {selectedVehicleDocumentCount}</strong>
                </span>
                <span>
                  <small>Captured data</small>
                  <strong>{selectedVehicleCaptureCount}</strong>
                </span>
                <span>
                  <small>Outstation</small>
                  <strong>{selectedVehicleHasOutstationPickup ? "Scheduled" : "None"}</strong>
                </span>
                <span>
                  <small>Profit</small>
                  <strong>{formatMoney(selectedVehicleProfit)}</strong>
                </span>
              </div>
              {selectedApprovalGaps.length > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  message="Attention"
                  description={selectedApprovalGaps.join(" · ")}
                />
              ) : null}
            </>
          ) : (
            <Alert type="info" showIcon message="Select a vehicle row to view its workflow summary." />
          )}
        </div>
        <div className="vehicleOperationFilters">
          <Input.Search
            allowClear
            placeholder="Search plate, make, model, year, stock owner, UCD"
            value={operationFilters.keyword}
            onChange={(event) => updateOperationFilter("keyword", event.target.value)}
          />
          <Select allowClear placeholder="Status" value={operationFilters.status} options={operationFilterOptions.status} onChange={(value) => updateOperationFilter("status", value)} />
          <Select allowClear placeholder="Approval" value={operationFilters.approval} options={operationFilterOptions.approval} onChange={(value) => updateOperationFilter("approval", value)} />
          <Button className="vehicleMoreFiltersButton" onClick={() => setMoreFiltersOpen((open) => !open)}>
            {moreFiltersOpen ? "Fewer filters" : `More filters${advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}`}
          </Button>
          {moreFiltersOpen ? (
            <>
              <Select allowClear placeholder="Stock owner" value={operationFilters.stockOwner} options={operationFilterOptions.stockOwner} onChange={(value) => updateOperationFilter("stockOwner", value)} />
              <Select allowClear placeholder="Website" value={operationFilters.publicState} options={operationFilterOptions.publicState} onChange={(value) => updateOperationFilter("publicState", value)} />
              <Select allowClear placeholder="Owner" value={operationFilters.ownerLink} options={operationFilterOptions.ownerLink} onChange={(value) => updateOperationFilter("ownerLink", value)} />
              <Select allowClear placeholder="Customer" value={operationFilters.customerLink} options={operationFilterOptions.customerLink} onChange={(value) => updateOperationFilter("customerLink", value)} />
              <Select allowClear placeholder="Invoice" value={operationFilters.invoiceLink} options={operationFilterOptions.invoiceLink} onChange={(value) => updateOperationFilter("invoiceLink", value)} />
              <Select allowClear placeholder="Outstation" value={operationFilters.outstationPickup} options={operationFilterOptions.outstationPickup} onChange={(value) => updateOperationFilter("outstationPickup", value)} />
              <Select allowClear placeholder="Leads" value={operationFilters.leadActivity} options={operationFilterOptions.leadActivity} onChange={(value) => updateOperationFilter("leadActivity", value)} />
            </>
          ) : null}
          <div className="vehicleFilterMeta">
            <Tag color={filterActive ? "blue" : "default"}>{filterActive ? `${filteredVehicles.length} of ${vehicles.length} matching` : `${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}`}</Tag>
            {filterActive && <Button size="small" onClick={() => { setOperationFilters({}); setMobileVehiclePage(1); }}>Clear filters</Button>}
          </div>
        </div>
        <div className="mobileRecordList">
          {filteredVehicles.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No vehicles match the current filters." />}
          {mobileVehicles.map((vehicle) => {
            const workflow = getVehicleWorkflowState(vehicle);

            return (
            <article className="mobileRecordCard vehicleMobileCard" key={vehicle.id}>
              <div className="mobileRecordHeader">
                <div>
                  <Typography.Text className="mobileRecordEyebrow">Plate / 车牌</Typography.Text>
                  <Typography.Title level={5}>{vehicle.plateNumber}</Typography.Title>
                </div>
                <Tag color={vehicleStatusColor[vehicle.status]}>{vehicle.status}</Tag>
              </div>
              <div className="mobileRecordMeta">
                <span>
                  <small>Vehicle / 车辆</small>
                  <strong>{vehicleName(vehicle)}</strong>
                </span>
                <span>
                  <small>Selling / 售价</small>
                  <strong>{formatMoney(vehicle.sellingPrice)}</strong>
                </span>
                <span>
                  <small>Invoice / 发票</small>
                  <strong>{invoiceCountForVehicle(vehicle.id) > 0 ? `${invoiceCountForVehicle(vehicle.id)} linked` : "Missing"}</strong>
                </span>
                <span>
                  <small>Active leads / 线索</small>
                  <strong>{activeLeadCountForVehicle(vehicle.id)}</strong>
                </span>
              </div>
              <div className={`vehicleWorkflowGuide vehicleWorkflowGuide-${workflow.color}`}>
                <div className="vehicleWorkflowTop">
                  <span>Current step / 当前步骤</span>
                  <Tag color={workflow.color}>{workflow.status}</Tag>
                </div>
                <strong>{workflow.next}</strong>
                <div className="vehicleWorkflowChecks">
                  <span className={vehicle.bossConfirmed ? "done" : "pending"}>{vehicle.bossConfirmed ? "Approved" : "Need approval"}</span>
                  <span className={vehicle.status !== "Available" || vehicle.isPublic ? "done" : "pending"}>{vehicle.status === "LoanProcessing" ? "Website hidden for loan" : vehicle.status === "Sold" ? "Website hidden after sale" : vehicle.isPublic ? "Website visible" : "Website hidden"}</span>
                  <span className={vehicle.customerId ? "done" : "pending"}>{vehicle.customerId ? "Customer linked" : "No customer"}</span>
                </div>
              </div>
              <div className="mobileRecordSection">
                <Typography.Text className="mobileRecordLabel">Workflow / 流程</Typography.Text>
                <Space wrap size={6}>
                  <Badge status={vehicle.bossConfirmed ? "success" : "warning"} text={vehicle.bossConfirmed ? "Approved" : "Approval pending"} />
                  <Badge status={vehicle.isPublic ? "success" : "default"} text={vehicle.isPublic ? "Website visible" : "Website hidden"} />
                </Space>
              </div>
              <div className="mobileRecordSection">
                <Typography.Text className="mobileRecordLabel">Contacts / 联系人</Typography.Text>
                <div className="mobileRecordTextBlock">
                  <span>Buyer: {contactFor(customers, vehicle.customerId)}</span>
                  <span>Owner: {contactFor(owners, vehicle.ownerId)}</span>
                </div>
              </div>
              <div className="mobileRecordFooter">
                <Tag color={workflow.color}>Next: {workflow.nextLabel}</Tag>
                {renderVehicleActions(vehicle)}
              </div>
            </article>
            );
          })}
          {filteredVehicles.length > mobileVehiclePageSize && (
            <Pagination
              current={clampedMobileVehiclePage}
              pageSize={mobileVehiclePageSize}
              total={filteredVehicles.length}
              showSizeChanger={false}
              onChange={setMobileVehiclePage}
            />
          )}
        </div>
        <Table
          className="desktopDataTable"
          rowKey="id"
          columns={compactOperationIntakeColumns}
          dataSource={filteredVehicles}
          pagination={{ ...tablePagination(8), current: clampedMobileVehiclePage, onChange: setMobileVehiclePage }}
          scroll={{ x: 1430 }}
          rowClassName={(row) => row.id === selectedVehicle?.id ? "selectedVehicleRow" : ""}
          onRow={(row) => ({
            onClick: () => selectVehicle(row.id)
          })}
          locale={{ emptyText: "No vehicles match the current filters." }}
        />
      </ProCard>
      <Modal
        title={loanHandoffVehicle ? `Start Loan / 开始贷款 - ${loanHandoffVehicle.plateNumber}` : "Start Loan / 开始贷款"}
        width={600}
        open={Boolean(loanHandoffVehicle)}
        onCancel={closeLoanHandoff}
        footer={null}
        destroyOnClose
        maskClosable={!loanHandoffSubmitting}
        closable={!loanHandoffSubmitting}
        keyboard={!loanHandoffSubmitting}
        className="loanHandoffModal"
      >
        {loanHandoffVehicle ? (
          <Space direction="vertical" size={16} className="fullWidth">
            <Alert
              type={loanHandoffStep === "select-buyer" ? "warning" : "info"}
              showIcon
              message={loanHandoffStep === "select-buyer" ? "Select the confirmed buyer" : "Confirm the buyer and loan handoff"}
              description={loanHandoffStep === "select-buyer"
                ? "This vehicle does not have a buyer linked yet. Select the correct customer before starting the loan."
                : "Review the linked buyer before moving this vehicle from public stock into loan processing."}
            />
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label="Vehicle / 车辆">{`${loanHandoffVehicle.plateNumber} - ${vehicleName(loanHandoffVehicle)}`}</Descriptions.Item>
              <Descriptions.Item label="Current status / 当前状态"><Tag color={vehicleStatusColor[loanHandoffVehicle.status]}>{loanHandoffVehicle.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Website / 网站"><Badge status={loanHandoffVehicle.isPublic ? "success" : "default"} text={loanHandoffVehicle.isPublic ? "Visible" : "Hidden"} /></Descriptions.Item>
            </Descriptions>
            <Form
              form={loanHandoffForm}
              layout="vertical"
              onFinish={(values) => void submitLoanHandoff(values)}
            >
              <Form.Item
                name="customerId"
                label="Confirmed Buyer / 确认买家"
                rules={[{ required: true, message: "Select the confirmed buyer before starting the loan." }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select customer"
                  options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))}
                  notFoundContent="No customers available"
                />
              </Form.Item>
              {customers.length === 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  message="Create a customer first"
                  description="A customer record is required before a vehicle can enter the loan workflow."
                  action={<Button onClick={() => openCustomerCreateForLoan(loanHandoffVehicle.id)}>New Customer</Button>}
                />
              ) : null}
              {customers.length > 0 ? (
                <Button type="link" className="loanHandoffNewBuyer" onClick={() => openCustomerCreateForLoan(loanHandoffVehicle.id)}>
                  Create a new buyer instead
                </Button>
              ) : null}
              <div className="loanHandoffImpact">
                <Typography.Text strong>When confirmed / 确认后</Typography.Text>
                <ul>
                  <li>A pending loan record is created for this buyer if one does not already exist.</li>
                  <li>The vehicle status changes to Loan Processing.</li>
                  <li>The vehicle is hidden from the public website while the loan is active.</li>
                </ul>
              </div>
              <div className="loanHandoffActions">
                <Button onClick={closeLoanHandoff} disabled={loanHandoffSubmitting}>Cancel</Button>
                <Button type="primary" htmlType="submit" loading={loanHandoffSubmitting} disabled={customers.length === 0}>
                  Confirm & Start Loan
                </Button>
              </div>
            </Form>
          </Space>
        ) : null}
      </Modal>
      <Drawer
        title={selectedVehicle ? `Vehicle Details / 车辆详情 - ${selectedVehicle.plateNumber}` : "Vehicle Details / 车辆详情"}
        width={960}
        open={vehicleDetailOpen}
        onClose={() => setVehicleDetailOpen(false)}
        destroyOnClose
        className="recordEditDrawer vehicleDetailDrawer"
      >
        <Space direction="vertical" size={16} className="fullWidth">
          {selectedVehicle ? (
            <ProCard title="Vehicle Summary / 车辆摘要">
              <Descriptions size="small" column={{ xs: 1, md: 3 }}>
                <Descriptions.Item label="Car Plate / 车牌">{selectedVehicle.plateNumber}</Descriptions.Item>
                <Descriptions.Item label="Vehicle / 车辆">{vehicleName(selectedVehicle)}</Descriptions.Item>
                <Descriptions.Item label="Status / 状态"><Tag color={vehicleStatusColor[selectedVehicle.status]}>{selectedVehicle.status}</Tag></Descriptions.Item>
                <Descriptions.Item label="Chassis Number">{selectedVehicle.chassisNumber || "-"}</Descriptions.Item>
                <Descriptions.Item label="Engine Number">{selectedVehicle.engineNumber || "-"}</Descriptions.Item>
                <Descriptions.Item label="Customer / 客户">{selectedVehicleCustomer ? customerSelectLabel(selectedVehicleCustomer) : "-"}</Descriptions.Item>
                <Descriptions.Item label="Owner / 原车主">{selectedVehicleOwner ? `${selectedVehicleOwner.name} / ${selectedVehicleOwner.phone}` : "-"}</Descriptions.Item>
                <Descriptions.Item label="Estimated Profit / 预估利润">{formatMoney(selectedVehicleProfit)}</Descriptions.Item>
              </Descriptions>
            </ProCard>
          ) : null}
          {selectedVehicle ? (
            <ProCard
              title="Intake Checklist / 收车检查"
              extra={<Tag color={selectedApprovalGaps.length > 0 ? "gold" : "green"}>{selectedApprovalGaps.length > 0 ? `${selectedApprovalGaps.length} attention` : "Ready"}</Tag>}
            >
              <div className="vehicleIntakeChecklist">
                <section className={selectedVehicle.ownerId ? "ready" : "attention"}>
                  <small>Owner handoff</small>
                  <strong>{selectedVehicleOwner ? selectedVehicleOwner.name : "Owner missing"}</strong>
                  <span>{selectedVehicleOwner ? selectedVehicleOwner.phone : "Link previous owner before intake is complete."}</span>
                </section>
                <section className={selectedVehicleInvoiceCount > 0 ? "ready" : "attention"}>
                  <small>Purchase invoice</small>
                  <strong>{selectedVehicleInvoiceCount > 0 ? `${selectedVehicleInvoiceCount} linked` : "Missing"}</strong>
                  <span>{selectedVehicleInvoiceCount > 0 ? "Invoice is linked to this vehicle." : "Create or link the purchase invoice."}</span>
                </section>
                <section className={selectedVehicleDocumentCount > 0 ? "ready" : "attention"}>
                  <small>Documents</small>
                  <strong>{selectedVehicleDocumentCount}</strong>
                  <span>{selectedVehicleDocumentCount > 0 ? "Documents uploaded." : "Upload VOC, AP, or intake documents when available."}</span>
                </section>
                <section className={selectedVehiclePhotoCount > 0 ? "ready" : "attention"}>
                  <small>Website photos</small>
                  <strong>{selectedVehiclePhotoCount}</strong>
                  <span>{selectedVehiclePhotoCount > 0 ? "Photo gallery started." : "Upload photos before publishing the car."}</span>
                </section>
                <section className={selectedVehicleCaptureCount > 0 ? "ready" : "attention"}>
                  <small>Captured data</small>
                  <strong>{selectedVehicleCaptureCount}</strong>
                  <span>{selectedVehicleCaptureCount > 0 ? "OCR captured fields are ready to review." : "Upload and OCR invoices or receipts to capture fields."}</span>
                </section>
                <section className={selectedVehicle.bossConfirmed ? "ready" : "attention"}>
                  <small>Management approval</small>
                  <strong>{selectedVehicle.bossConfirmed ? "Confirmed" : "Pending"}</strong>
                <span>{selectedVehicle.contraRangePrice ? `Contra ${formatMoney(selectedVehicle.contraRangePrice)}` : "Set contra range and confirm approval."}</span>
                </section>
                <section className={selectedVehicle.ucdStatus ? "ready" : "attention"}>
                  <small>{shortformLabel("UCD", "Used car department status tracking")}</small>
                  <strong>{selectedVehicle.ucdStatus || "Not tracked"}</strong>
                  <span>{selectedVehicle.ucdStatus ? "Used car department status recorded." : "Add UCD status for intake visibility."}</span>
                </section>
                <section className={selectedVehicleHasOutstationPickup ? "ready" : "neutral"}>
                  <small>Outstation pickup</small>
                  <strong>{selectedVehicleHasOutstationPickup ? "Scheduled" : "None"}</strong>
                  <span>{selectedVehicle.outstationPickupScheduledAt ? String(selectedVehicle.outstationPickupScheduledAt).replace("T", " ").slice(0, 16) : selectedVehicle.outstationPickupBookingSlip || "No outstation pickup recorded."}</span>
                </section>
                <section className={selectedVehicleActiveLeads.length > 0 ? "ready" : "neutral"}>
                  <small>Sales leads</small>
                  <strong>{selectedVehicleActiveLeads.length} active</strong>
                  <span>{selectedVehicleCustomer ? `Buyer: ${selectedVehicleCustomer.name}` : "No confirmed buyer linked yet."}</span>
                </section>
              </div>
            </ProCard>
          ) : null}
          <ProCard
            title="Vehicle Record / 收车资料"
          >
            <Form
              key={selectedVehicle?.id ?? "vehicle-detail-edit"}
              layout="vertical"
              className="formGrid vehicleDetailForm"
              initialValues={selectedVehicle}
              onFinish={(values) => {
                if (!selectedVehicle) return;
                const bossConfirmed = canApproveVehicles ? Boolean(values.bossConfirmed) : Boolean(selectedVehicle.bossConfirmed);
                const vehicle = vehicleFromIntakeValues({
                  ...values,
                  stockOwner: values.stockOwner || selectedVehicle.stockOwner || "YSHeng",
                  status: selectedVehicle.status,
                  bossConfirmed,
                  isPublic: bossConfirmed ? Boolean(values.isPublic) : false
                }, selectedVehicle.id);
                const blockReason = vehicleCreateBlockReason(vehicle, vehicles);
                if (blockReason) {
                  message.warning(blockReason);
                  return;
                }

                onUpdate(vehicle);
                message.success("Vehicle record updated.");
              }}
            >
              <Form.Item name="plateNumber" label="Plate / 车牌" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="chassisNumber" label="Chassis Number"><Input /></Form.Item>
              <Form.Item name="engineNumber" label="Engine Number"><Input /></Form.Item>
              <Form.Item name="make" label="Make"><Input placeholder="Toyota" /></Form.Item>
              <Form.Item name="model" label="Model"><Input placeholder="Vios" /></Form.Item>
              <Form.Item name="year" label="Year"><InputNumber className="fullWidth" min={1990} max={2030} /></Form.Item>
              <Form.Item name="purchasePrice" label="Purchase / 收车价"><InputNumber className="fullWidth" min={0} /></Form.Item>
              <Form.Item name="sellingPrice" label="Selling / 售价"><InputNumber className="fullWidth" min={0} /></Form.Item>
              <Form.Item name="bossConfirmed" label="Management Approval / 管理层审批" extra={canApproveVehicles ? "Only Boss/Admin can change approval." : "Read-only. Ask Boss/Admin to approve this vehicle."}>
                <Select disabled={!canApproveVehicles} options={[{ value: true, label: "Approved" }, { value: false, label: "Pending" }]} />
              </Form.Item>
              <Form.Item name="stockOwner" label="Stock Owner / 库存方"><Select options={["YSHeng", "KS"].map((value) => ({ value }))} /></Form.Item>
              <Form.Item name="stockLocation" label="Stock Location / 停放地点"><Input placeholder="Main Yard / KS Yard / Workshop" /></Form.Item>
              <Form.Item name="contraRangePrice" label="Contra Range Price / Contra 价格范围"><InputNumber className="fullWidth" min={0} /></Form.Item>
              <Form.Item name="ucdStatus" label={shortformLabel("UCD Status Tracking", "Used car department status tracking")}><Input placeholder="Ready / Pending / Submitted" /></Form.Item>
              <Form.Item name="additionalCharges" label="Additional Charges / 杂费"><InputNumber className="fullWidth" min={0} /></Form.Item>
              <Form.Item name="refurbishmentTotal" label="Refurbishment Total / 整备预算"><InputNumber className="fullWidth" min={0} /></Form.Item>
              <Form.Item name="commissionTotal" label="Commission / 佣金"><InputNumber className="fullWidth" min={0} /></Form.Item>
              <Form.Item name="outstationPickupAllowance" label="Outstation Pickup Allowance / 外地收车津贴"><InputNumber className="fullWidth" min={0} /></Form.Item>
              <Form.Item name="outstationPickupScheduledAt" label="Outstation Pickup Date & Time / 外地收车时间"><Input type="datetime-local" /></Form.Item>
              <Form.Item name="outstationPickupBookingSlip" label="Booking Slip Reference / Booking Slip"><Input placeholder="Booking slip no. or file ref" /></Form.Item>
              <Form.Item name="customerId" label="Customer / 客户" extra={selectedVehicleCustomerPolicy.locked ? "Locked while an active loan protects the confirmed buyer." : selectedVehicleCustomerPolicy.allowedCustomerIds.length > 0 ? "Select the buyer already named by the active loan." : undefined}>
                <Select disabled={selectedVehicleCustomerPolicy.locked} allowClear={selectedVehicleCustomerPolicy.allowedCustomerIds.length === 0} showSearch optionFilterProp="label" placeholder="Select customer" options={selectedVehicleCustomerOptions.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} />
              </Form.Item>
              <Form.Item name="ownerId" label="Owner / 原车主">
                <Select allowClear showSearch optionFilterProp="label" placeholder="Select owner" options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} />
              </Form.Item>
              <Descriptions size="small" column={1} className="fullWidth">
                <Descriptions.Item label="Status / 状态">{selectedVehicle?.status ?? "Available"} — updated by the loan and payment workflows.</Descriptions.Item>
              </Descriptions>
              <Form.Item name="isPublic" label="Website Visible" extra={!selectedVehicle?.bossConfirmed && !canApproveVehicles ? "Website visibility stays hidden until Boss/Admin approval." : undefined}>
                <Select disabled={!canApproveVehicles && !selectedVehicle?.bossConfirmed} options={[{ value: true, label: "Visible" }, { value: false, label: "Hidden" }]} />
              </Form.Item>
              <Form.Item className="vehicleMarkdownField" name="publicDescriptionMarkdown" label="Public Listing Description (Markdown)" extra="Supports headings, paragraphs, bullet lists, bold, italics, and safe HTTPS links. Raw HTML is displayed as text.">
                <MDEditor preview="edit" height={220} visibleDragbar={false} textareaProps={{ maxLength: 6000, placeholder: "## Ready stock\n\n- Key feature\n- Viewing by appointment" }} />
              </Form.Item>
              <div className="vehicleMarkdownPreviewField">
                <Form.Item noStyle shouldUpdate={(previous, current) => previous.publicDescriptionMarkdown !== current.publicDescriptionMarkdown}>
                  {({ getFieldValue }) => <MarketingDescription markdown={getFieldValue("publicDescriptionMarkdown")} className="backofficeMarketingPreview" />}
                </Form.Item>
              </div>
              <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedVehicle}>Update Vehicle</Button></Form.Item>
            </Form>
          </ProCard>
          <ProCard title="Stock Movement History / 库存变动记录">
            <Table
              rowKey="id"
              size="small"
              columns={[
                { title: "Time / 时间", dataIndex: "createdAt", render: (value) => String(value).replace("T", " ").slice(0, 16) },
                { title: "Field / 字段", dataIndex: "fieldName" },
                { title: "Previous / 旧值", dataIndex: "previousValue", render: (value) => value || "-" },
                { title: "New / 新值", dataIndex: "newValue", render: (value) => value || "-" },
                { title: "Actor / 操作人", dataIndex: "actor", render: (value) => value || "System" },
                { title: "Reason / 原因", dataIndex: "reason" }
              ]}
              dataSource={stockMovements}
              pagination={tablePagination(5)}
              scroll={{ x: 820 }}
              locale={{ emptyText: "No stock movements recorded yet" }}
            />
          </ProCard>
          <ProCard
            id="purchase-invoice-list-card"
            title="Purchase Invoice / 收车发票"
            extra={<Button type="primary" onClick={() => setPurchaseInvoiceCreateOpen(true)}>New Purchase Invoice</Button>}
          >
            <Table rowKey="id" columns={purchaseInvoiceColumns} dataSource={selectedVehicleInvoices} pagination={tablePagination(5)} scroll={{ x: 560 }} locale={{ emptyText: "No purchase invoice linked to this vehicle yet." }} />
          </ProCard>
          <ProCard id="linked-people-card" title="Linked People / 关联人员">
            <Typography.Text type="secondary">
              Customer details come from Leads or manual customer entry. This vehicle screen links the correct customer and previous owner to the stock record.
            </Typography.Text>
            <div className="vehicleContactGrid">
              <section className="vehicleContactCard">
                <div className="vehicleContactHeader">
                  <div>
                    <Typography.Text className="moduleEyebrow">Buyer / Customer</Typography.Text>
                    <Typography.Title level={5}>Customer record</Typography.Title>
                  </div>
                  <Tag color={selectedVehicleCustomer ? "green" : "gold"}>{selectedVehicleCustomer ? "Linked" : "Not linked"}</Tag>
                </div>
                {selectedVehicleCustomer ? (
                  <div className="vehicleContactBody">
                    <strong>{selectedVehicleCustomer.name}</strong>
                    <span>{selectedVehicleCustomer.phone}</span>
                    <small>{selectedVehicleCustomer.email || "No email"}</small>
                  </div>
                ) : (
                  <Alert type="info" showIcon message="No customer linked" description="Select a customer in Vehicle Record when the buyer is confirmed." />
                )}
                <Space wrap>
                  <Button disabled={!selectedVehicleCustomer} onClick={() => selectedVehicleCustomer && onOpenCustomer(selectedVehicleCustomer.id)}>Customer 360</Button>
                  <Button disabled={!selectedVehicleCustomer} onClick={() => selectedVehicleCustomer && selectCustomer(selectedVehicleCustomer.id)}>Edit Customer</Button>
                  <Button onClick={() => setCustomerCreateOpen(true)}>New Customer</Button>
                </Space>
              </section>
              <section className="vehicleContactCard">
                <div className="vehicleContactHeader">
                  <div>
                    <Typography.Text className="moduleEyebrow">Previous Owner</Typography.Text>
                    <Typography.Title level={5}>Owner record</Typography.Title>
                  </div>
                  <Tag color={selectedVehicleOwner ? "green" : "gold"}>{selectedVehicleOwner ? "Linked" : "Not linked"}</Tag>
                </div>
                {selectedVehicleOwner ? (
                  <div className="vehicleContactBody">
                    <strong>{selectedVehicleOwner.name}</strong>
                    <span>{selectedVehicleOwner.phone}</span>
                    <small>Previous owner contact</small>
                  </div>
                ) : (
                  <Alert type="info" showIcon message="No owner linked" description="Select an owner in Vehicle Record during vehicle intake." />
                )}
                <Space wrap>
                  <Button disabled={!selectedVehicleOwner} onClick={() => selectedVehicleOwner && selectOwner(selectedVehicleOwner.id)}>Edit Owner</Button>
                  <Button onClick={() => setOwnerCreateOpen(true)}>New Owner</Button>
                </Space>
              </section>
            </div>
          </ProCard>
          <ProCard
            id="vehicle-leads-card"
            title="Leads For This Vehicle"
            extra={<Tag color={selectedVehicleActiveLeads.length > 1 ? "red" : selectedVehicleActiveLeads.length === 1 ? "green" : "default"}>{selectedVehicleActiveLeads.length} active</Tag>}
          >
            <Typography.Text type="secondary">
              Multiple customers can enquire about the same car. The linked customer above remains the confirmed buyer once sales closes the deal.
            </Typography.Text>
            <Table
              rowKey="id"
              size="small"
              columns={[
                { title: "Customer", dataIndex: "customerName" },
                { title: "Phone", dataIndex: "phone" },
                { title: "Status", dataIndex: "status", render: (status: Lead["status"]) => <Tag color={status === "New" ? "orange" : status === "Contacted" ? "blue" : "green"}>{status}</Tag> },
                { title: "Received", dataIndex: "createdAt", render: (value) => String(value).slice(0, 10) },
                { title: "Message", dataIndex: "message", render: (value) => value || "-" }
              ]}
              dataSource={selectedVehicleLeads}
              pagination={tablePagination(5)}
              scroll={{ x: 720 }}
              locale={{ emptyText: "No leads yet for this vehicle" }}
            />
          </ProCard>
          <ProCard title="Photo & Document Upload / 照片与文件上传">
            <Form layout="vertical" className="formGrid vehicleUploadForm">
              <Form.Item className="vehiclePhotoDropField" label="Website Photos">
                <Upload.Dragger
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadDisabled}
                  multiple
                  maxCount={12}
                  showUploadList
                  beforeUpload={(file) => {
                    if (file.size > maxWebsitePhotoBytes) {
                      message.warning("Website photo must be 5MB or smaller.");
                      return Upload.LIST_IGNORE;
                    }

                    return true;
                  }}
                  customRequest={(option) => {
                    void onUploadPhoto(selectedVehicleId, option.file as File)
                      .then(async () => {
                        await loadUploads();
                        option.onSuccess?.({}, option.file);
                      })
                      .catch((error: Error) => option.onError?.(error));
                  }}
                >
                  <p className="vehiclePhotoDropIcon"><UploadOutlined /></p>
                  <p className="vehiclePhotoDropTitle">Drag photos here or tap to upload</p>
                  <p className="vehiclePhotoDropHint">Supports multiple JPG, PNG, or WebP images for the public website gallery.</p>
                </Upload.Dragger>
              </Form.Item>
              <div className="vehiclePhotoSection">
                {photoPreviewGrid}
              </div>
              <div className="vehicleDocumentSection">
                <Typography.Text className="moduleEyebrow">Documents</Typography.Text>
              </div>
              <MissingUploadReminder
                items={selectedVehicleUploadReminders}
                title="Vehicle uploads need attention / 车辆上传需注意"
                description="These files are optional during intake. Add them before the relevant downstream workflow needs them."
                onAction={selectedVehicleMissingDocuments.length > 0 ? () => setDocumentCategory(selectedVehicleMissingDocuments[0]) : undefined}
              />
              <Form.Item label="Document Type">
                <Select<DocumentCategory>
                  value={documentCategory}
                  onChange={setDocumentCategory}
                  options={[
                    { value: "PurchaseInvoice", label: "Purchase Invoice" },
                    { value: "Voc", label: shortformLabel("VOC", "Vehicle ownership certificate") },
                    { value: "IdentityCard", label: shortformLabel("IC", "Customer identity card") },
                    { value: "ApDocument", label: shortformLabel("AP Document", "Approved permit document") },
                    { value: "StatusReceipt", label: "Status Receipt" },
                    { value: "LoanDocument", label: "Loan Document" },
                    { value: "DeliveryDocument", label: "Delivery Document" },
                    { value: "Policy", label: "Policy" },
                    { value: "RoadTaxReceipt", label: "Road Tax Receipt" },
                    { value: "RepairInvoice", label: "Repair Invoice" }
                  ]}
                />
              </Form.Item>
              <Form.Item label="Document Upload">
                {documentCategory === "PurchaseInvoice" || documentCategory === "IdentityCard" || documentCategory === "Voc" ? (
                  <OcrUploadReview
                    vehicleId={selectedVehicleId}
                    category={documentCategory}
                    disabled={uploadDisabled}
                    buttonLabel={documentCategory === "IdentityCard" ? "Add identity card photo" : documentCategory === "Voc" ? "Add VOC photo" : "Add purchase invoice photo"}
                    applyLabel={documentCategory === "IdentityCard" ? "Use details in customer record" : documentCategory === "Voc" ? "Use details in vehicle record" : "Use details in purchase invoice"}
                    existingValues={documentCategory === "IdentityCard"
                      ? selectedVehicleCustomer
                        ? { customerName: selectedVehicleCustomer.name, icNumber: selectedVehicleCustomer.icNumber, address: selectedVehicleCustomer.address }
                        : undefined
                      : documentCategory === "Voc" && selectedVehicle
                        ? { plateNumber: selectedVehicle.plateNumber, chassisNumber: selectedVehicle.chassisNumber, engineNumber: selectedVehicle.engineNumber, make: selectedVehicle.make, model: selectedVehicle.model, year: selectedVehicle.year }
                        : undefined}
                    fields={documentCategory === "IdentityCard"
                      ? [
                        { name: "customerName", label: "Customer Name" },
                        { name: "icNumber", label: "IC Number" },
                        { name: "address", label: "Address" }
                      ]
                      : documentCategory === "Voc"
                        ? [
                          { name: "plateNumber", label: "Registration Number" },
                          { name: "chassisNumber", label: "Chassis Number" },
                          { name: "engineNumber", label: "Engine Number" },
                          { name: "make", label: "Make" },
                          { name: "model", label: "Model" },
                          { name: "year", label: "Year", type: "number" },
                          { name: "ownerName", label: "Registered Owner" }
                        ]
                      : [
                        { name: "vehicleId", label: "Car Plate", type: "select", options: vehicleOptions },
                        { name: "invoiceNumber", label: "Invoice Number" },
                        { name: "amount", label: "Purchase Amount", type: "number" }
                      ]}
                    onUploaded={() => void loadUploads()}
                    onApply={(values) => {
                      if (documentCategory === "IdentityCard") {
                        if (!selectedVehicleCustomer) {
                          message.warning("Link a customer to this vehicle before applying approved IC values.");
                          return;
                        }
                        onUpdateCustomer({
                          ...selectedVehicleCustomer,
                          name: ocrText(values.customerName, selectedVehicleCustomer.name),
                          icNumber: ocrOptionalText(values.icNumber, selectedVehicleCustomer.icNumber),
                          address: ocrOptionalText(values.address, selectedVehicleCustomer.address)
                        });
                        message.success("Approved IC values were saved to the linked customer record.");
                      } else if (documentCategory === "Voc") {
                        if (!selectedVehicle) return;
                        const ocrYear = Number(values.year);
                        onUpdate({
                          ...selectedVehicle,
                          plateNumber: ocrText(values.plateNumber, selectedVehicle.plateNumber),
                          chassisNumber: ocrOptionalText(values.chassisNumber, selectedVehicle.chassisNumber),
                          engineNumber: ocrOptionalText(values.engineNumber, selectedVehicle.engineNumber),
                          make: ocrText(values.make, selectedVehicle.make),
                          model: ocrText(values.model, selectedVehicle.model),
                          year: Number.isInteger(ocrYear) && ocrYear > 0 ? ocrYear : selectedVehicle.year
                        });
                        message.success("Approved VOC registration, chassis, engine, make, model, and year were saved to the vehicle record. Registered owner remains in the reviewed OCR record for audit.");
                      } else {
                        setPurchaseInvoiceOcrDraft(values);
                        setPurchaseInvoiceCreateOpen(true);
                      }
                      void loadUploads();
                    }}
                  />
                ) : (
                  <Upload
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    disabled={uploadDisabled}
                    multiple
                    maxCount={12}
                    showUploadList
                    customRequest={(option) => {
                      void onUploadDocument(selectedVehicleId, option.file as File, documentCategory)
                        .then(async () => {
                          await loadUploads();
                          option.onSuccess?.({}, option.file);
                        })
                        .catch((error: Error) => option.onError?.(error));
                    }}
                  >
                    <Button icon={<UploadOutlined />} disabled={uploadDisabled}>Upload Documents</Button>
                  </Upload>
                )}
              </Form.Item>
            </Form>
            {documentMobileCards}
            <Table className="vehicleDocumentTable desktopDataTable" rowKey="id" columns={documentColumns} dataSource={documents} pagination={tablePagination(5)} scroll={{ x: 760 }} locale={{ emptyText: "No documents uploaded yet." }} />
            <div className="vehicleCapturedDataSection">
              <div>
                <Typography.Text className="moduleEyebrow">Captured Receipt / Invoice Data</Typography.Text>
                <Typography.Text type="secondary">OCR values saved with uploaded documents. Staff can review them before applying values into invoice or payment records.</Typography.Text>
              </div>
              {ocrMobileCards}
              <Table className="vehicleOcrTable desktopDataTable" rowKey="id" columns={ocrColumns} dataSource={ocrJobs} pagination={tablePagination(5)} scroll={{ x: 980 }} locale={{ emptyText: "No captured receipt or invoice data yet." }} />
            </div>
          </ProCard>
        </Space>
      </Drawer>
      <Modal
        title="Create Vehicle / 新增车辆"
        width={860}
        open={vehicleCreateOpen}
        onCancel={() => setVehicleCreateOpen(false)}
        footer={null}
        destroyOnClose
        className="recordCreateModal"
      >
        <Form layout="vertical" className="modalForm formGrid" onFinish={(values) => {
          const bossConfirmed = canApproveVehicles ? Boolean(values.bossConfirmed) : false;
          const vehicle = vehicleFromIntakeValues({
            ...values,
            stockOwner: values.stockOwner || "YSHeng",
            status: "Available",
            bossConfirmed,
            isPublic: bossConfirmed ? Boolean(values.isPublic) : false
          }, newId());
          const blockReason = vehicleCreateBlockReason(vehicle, vehicles);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }

          onCreate(vehicle);
          setVehicleCreateOpen(false);
        }} initialValues={{ status: "Available", stockOwner: "YSHeng", stockLocation: "Main Yard", isPublic: false, bossConfirmed: false, contraRangePrice: 0, additionalCharges: 0, refurbishmentTotal: 0, commissionTotal: 0, outstationPickupAllowance: 0 }}>
          <Form.Item name="plateNumber" label="Plate / 车牌" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="chassisNumber" label="Chassis Number"><Input /></Form.Item>
          <Form.Item name="engineNumber" label="Engine Number"><Input /></Form.Item>
          <Form.Item name="make" label="Make"><Input placeholder="Toyota" /></Form.Item>
          <Form.Item name="model" label="Model"><Input placeholder="Vios" /></Form.Item>
          <Form.Item name="year" label="Year"><InputNumber className="fullWidth" min={1990} max={2030} /></Form.Item>
          <Form.Item name="purchasePrice" label="Purchase / 收车价"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="sellingPrice" label="Selling / 售价"><InputNumber className="fullWidth" min={0} /></Form.Item>
          {canApproveVehicles ? (
            <>
              <Form.Item name="bossConfirmed" label="Management Approval / 管理层审批" extra="Only Boss/Admin can approve vehicle intake."><Select options={[{ value: true, label: "Approved" }, { value: false, label: "Pending" }]} /></Form.Item>
              <Form.Item name="isPublic" label="Website Visible"><Select options={[{ value: true, label: "Visible" }, { value: false, label: "Hidden" }]} /></Form.Item>
            </>
          ) : (
            <Alert type="info" showIcon message="Admin approval required" description="This vehicle will be created as Pending and hidden from the public website until Boss/Admin approves it." />
          )}
          <Form.Item name="stockOwner" label="Stock Owner / 库存方"><Select options={["YSHeng", "KS"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="stockLocation" label="Stock Location / 停放地点"><Input placeholder="Main Yard / KS Yard / Workshop" /></Form.Item>
          <Form.Item name="contraRangePrice" label="Contra Range Price / Contra 价格范围"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="ucdStatus" label={shortformLabel("UCD Status Tracking", "Used car department status tracking")}><Input placeholder="Ready / Pending / Submitted" /></Form.Item>
          <Form.Item name="additionalCharges" label="Additional Charges / 杂费"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="refurbishmentTotal" label="Refurbishment Total / 整备预算"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="commissionTotal" label="Commission / 佣金"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="outstationPickupAllowance" label="Outstation Pickup Allowance / 外地收车津贴"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="outstationPickupScheduledAt" label="Outstation Pickup Date & Time / 外地收车时间"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="outstationPickupBookingSlip" label="Booking Slip Reference / Booking Slip"><Input placeholder="Booking slip no. or file ref" /></Form.Item>
          <Form.Item name="customerId" label="Customer / 客户">
            <Select allowClear showSearch optionFilterProp="label" placeholder="Select customer" options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} />
          </Form.Item>
          <Form.Item name="ownerId" label="Owner / 原车主">
            <Select allowClear showSearch optionFilterProp="label" placeholder="Select owner" options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} />
          </Form.Item>
          <Alert type="info" showIcon message="New vehicles start as Available. Loan processing and sold status are updated by their workflows." />
          <Form.Item className="vehicleMarkdownField" name="publicDescriptionMarkdown" label="Public Listing Description (Markdown)" extra="Optional public copy. Raw HTML is displayed as text.">
            <MDEditor preview="edit" height={220} visibleDragbar={false} textareaProps={{ maxLength: 6000, placeholder: "## Ready stock\n\n- Key feature\n- Viewing by appointment" }} />
          </Form.Item>
          <div className="vehicleMarkdownPreviewField">
            <Form.Item noStyle shouldUpdate={(previous, current) => previous.publicDescriptionMarkdown !== current.publicDescriptionMarkdown}>
              {({ getFieldValue }) => <MarketingDescription markdown={getFieldValue("publicDescriptionMarkdown")} className="backofficeMarketingPreview" />}
            </Form.Item>
          </div>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Vehicle</Button></Form.Item>
        </Form>
      </Modal>
      {false && <ProCard
        id="purchase-invoice-list-card"
        title="Purchase Invoice / 收车发票"
        extra={<Button type="primary" onClick={() => setPurchaseInvoiceCreateOpen(true)}>New Purchase Invoice</Button>}
      >
        <Table rowKey="id" columns={purchaseInvoiceColumns} dataSource={purchaseInvoices} pagination={tablePagination(5)} scroll={{ x: 560 }} />
      </ProCard>}
      <Modal
        title="New Purchase Invoice / 新增收车发票"
        width={620}
        open={purchaseInvoiceCreateOpen}
        onCancel={() => {
          setPurchaseInvoiceCreateOpen(false);
          setPurchaseInvoiceOcrDraft(null);
        }}
        footer={null}
        destroyOnClose
        className="recordCreateModal"
      >
        <Form layout="vertical" className="modalForm" onFinish={async (values) => {
          const invoice: PurchaseInvoice = {
            id: newId(),
            vehicleId: values.vehicleId,
            invoiceNumber: values.invoiceNumber,
            amount: Number(values.amount ?? 0)
          };
          const blockReason = purchaseInvoiceCreateBlockReason(invoice, purchaseInvoices);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }

          await onCreatePurchaseInvoice(invoice);
          setPurchaseInvoiceOcrDraft(null);
          setPurchaseInvoiceCreateOpen(false);
        }} initialValues={{ vehicleId: selectedVehicleId || vehicles[0]?.id, ...purchaseInvoiceOcrDraft }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice Number" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="amount" label="Purchase Amount"><InputNumber className="fullWidth" min={0} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Purchase Invoice</Button></Form.Item>
        </Form>
      </Modal>
      <Drawer
        title="Purchase Invoice Details / 收车发票详情"
        width={560}
        open={purchaseInvoiceEditorOpen}
        onClose={() => setPurchaseInvoiceEditorOpen(false)}
        destroyOnClose
        className="recordEditDrawer"
      >
        <Form
          key={selectedPurchaseInvoice?.id ?? "purchase-invoice-edit"}
          layout="vertical"
          className="drawerForm"
          initialValues={selectedPurchaseInvoice}
          onFinish={async (values) => {
            if (!selectedPurchaseInvoice) return;
            const invoice: PurchaseInvoice = {
              ...selectedPurchaseInvoice,
              vehicleId: values.vehicleId,
              invoiceNumber: values.invoiceNumber,
              amount: Number(values.amount ?? 0)
            };
            const blockReason = purchaseInvoiceCreateBlockReason(invoice, purchaseInvoices);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }

            await onUpdatePurchaseInvoice(invoice);
            setPurchaseInvoiceEditorOpen(false);
          }}
        >
          <Form.Item name="id" label="Selected Purchase Invoice"><Select options={purchaseInvoices.map((invoice) => ({ value: invoice.id, label: `${plateFor(vehicles, invoice.vehicleId)} / ${invoice.invoiceNumber}` }))} onChange={selectPurchaseInvoice} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice Number" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="amount" label="Purchase Amount"><InputNumber className="fullWidth" min={0} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedPurchaseInvoice}>Update Purchase Invoice</Button></Form.Item>
        </Form>
      </Drawer>
      {false && <ProCard id="contacts-card" title="Customer & Owner Details / 客户与原车主">
        <Tabs
          items={[
            {
              key: "customers",
              label: "Customers",
              children: (
                <Space direction="vertical" size={16} className="fullWidth">
                  <div className="tableToolbar">
                    <Typography.Text type="secondary">Customer records used by leads, loans, delivery and finance.</Typography.Text>
                    <Button type="primary" onClick={() => setCustomerCreateOpen(true)}>New Customer</Button>
                  </div>
                  <Table rowKey="id" columns={customerColumns} dataSource={customers} pagination={tablePagination(5)} scroll={{ x: 720 }} locale={{ emptyText: "No customer records yet." }} />
                  <Modal
                    title="New Customer / 新增客户"
                    width={620}
                    open={customerCreateOpen}
                    onCancel={() => setCustomerCreateOpen(false)}
                    footer={null}
                    destroyOnClose
                    className="recordCreateModal"
                  >
                  <Form layout="vertical" className="modalForm" onFinish={(values) => {
                    const customer: Customer = {
                      id: newId(),
                      name: values.name,
                      phone: values.phone,
                      icNumber: values.icNumber,
                      email: values.email,
                      address: values.address,
                      notes: values.notes
                    };
                    const blockReason = customerCreateBlockReason(customer, customers);
                    if (blockReason) {
                      message.warning(blockReason);
                      return;
                    }

                    onCreateCustomer(customer);
                    setCustomerCreateOpen(false);
                  }}>
                    <Form.Item name="name" label="Customer Name / 客户姓名" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="icNumber" label={shortformLabel("IC / 身份证", "Identity card number")}><Input /></Form.Item>
                    <Form.Item name="email" label="Email"><Input /></Form.Item>
                    <Form.Item name="address" label="Address / 地址"><Input placeholder="Customer address for invoice/delivery" /></Form.Item>
                    <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Customer detail note" /></Form.Item>
                    <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Customer</Button></Form.Item>
                  </Form>
                  </Modal>
                  {false && <Form
                    key={selectedCustomer?.id ?? "customer-edit"}
                    layout="vertical"
                    className="formGrid"
                    initialValues={selectedCustomer}
                    onFinish={(values) => {
                      if (!selectedCustomer) return;
                      const customer: Customer = {
                        ...selectedCustomer,
                        name: values.name,
                        phone: values.phone,
                        icNumber: values.icNumber,
                        email: values.email,
                        address: values.address,
                        notes: values.notes
                      };
                      const blockReason = customerCreateBlockReason(customer, customers);
                      if (blockReason) {
                        message.warning(blockReason);
                        return;
                      }

                      onUpdateCustomer(customer);
                    }}
                  >
                    <Form.Item name="id" label="Edit Customer"><Select options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} onChange={selectCustomer} /></Form.Item>
                    <Form.Item name="name" label="Customer Name / 客户姓名" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="icNumber" label={shortformLabel("IC / 身份证", "Identity card number")}><Input /></Form.Item>
                    <Form.Item name="email" label="Email"><Input /></Form.Item>
                    <Form.Item name="address" label="Address / 地址"><Input placeholder="Customer address for invoice/delivery" /></Form.Item>
                    <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Customer detail note" /></Form.Item>
                    <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedCustomer}>Update Customer</Button></Form.Item>
                  </Form>}
                </Space>
              )
            },
            {
              key: "owners",
              label: "Owners",
              children: (
                <Space direction="vertical" size={16} className="fullWidth">
                  <div className="tableToolbar">
                    <Typography.Text type="secondary">Previous owner records for vehicle intake and settlement.</Typography.Text>
                    <Button type="primary" onClick={() => setOwnerCreateOpen(true)}>New Owner</Button>
                  </div>
                  <Table rowKey="id" columns={ownerColumns} dataSource={owners} pagination={tablePagination(5)} scroll={{ x: 520 }} locale={{ emptyText: "No previous owner records yet." }} />
                  <Modal
                    title="New Owner / 新增原车主"
                    width={560}
                    open={ownerCreateOpen}
                    onCancel={() => setOwnerCreateOpen(false)}
                    footer={null}
                    destroyOnClose
                    className="recordCreateModal"
                  >
                  <Form layout="vertical" className="modalForm" onFinish={(values) => {
                    const owner: Owner = {
                      id: newId(),
                      name: values.name,
                      phone: values.phone
                    };
                    const blockReason = ownerCreateBlockReason(owner, owners);
                    if (blockReason) {
                      message.warning(blockReason);
                      return;
                    }

                    onCreateOwner(owner);
                    setOwnerCreateOpen(false);
                  }}>
                    <Form.Item name="name" label="Owner Name / 原车主姓名" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Owner</Button></Form.Item>
                  </Form>
                  </Modal>
                  {false && <Form
                    key={selectedOwner?.id ?? "owner-edit"}
                    layout="vertical"
                    className="formGrid"
                    initialValues={selectedOwner}
                    onFinish={(values) => {
                      if (!selectedOwner) return;
                      const owner: Owner = {
                        ...selectedOwner,
                        name: values.name,
                        phone: values.phone
                      };
                      const blockReason = ownerCreateBlockReason(owner, owners);
                      if (blockReason) {
                        message.warning(blockReason);
                        return;
                      }

                      onUpdateOwner(owner);
                    }}
                  >
                    <Form.Item name="id" label="Edit Owner"><Select options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} onChange={selectOwner} /></Form.Item>
                    <Form.Item name="name" label="Owner Name / 原车主姓名" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedOwner}>Update Owner</Button></Form.Item>
                  </Form>}
                </Space>
              )
            }
          ]}
        />
      </ProCard>}
      <Modal
        title="New Customer / 新增客户"
        width={620}
        open={customerCreateOpen}
        onCancel={() => { setCustomerCreateOpen(false); setCustomerCreateForLoanVehicleId(""); }}
        footer={null}
        destroyOnClose
        maskClosable={!customerCreating}
        closable={!customerCreating}
        keyboard={!customerCreating}
        className="recordCreateModal"
      >
        <Form layout="vertical" className="modalForm" onFinish={async (values) => {
          const customer: Customer = {
            id: newId(),
            name: values.name,
            phone: values.phone,
            icNumber: values.icNumber,
            email: values.email,
            address: values.address,
            notes: values.notes
          };
          const blockReason = customerCreateBlockReason(customer, customers);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }

          setCustomerCreating(true);
          try {
            await onCreateCustomer(customer);
            const loanVehicleId = customerCreateForLoanVehicleId;
            setCustomerCreateForLoanVehicleId("");
            setCustomerCreateOpen(false);
            if (loanVehicleId) {
              selectVehicle(loanVehicleId);
              setLoanHandoffCustomerId(customer.id);
              setLoanHandoffVehicleId(loanVehicleId);
            }
          } catch {
            // The parent surfaces the API error. Keep the customer form open for correction.
          } finally {
            setCustomerCreating(false);
          }
        }}>
          <Form.Item name="name" label="Customer Name / 客户姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="icNumber" label={shortformLabel("IC / 身份证", "Identity card number")}><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input /></Form.Item>
          <Form.Item name="address" label="Address / 地址"><Input placeholder="Customer address for invoice/delivery" /></Form.Item>
          <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Customer detail note" /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" loading={customerCreating}>{customerCreateForLoanVehicleId ? "Create & Continue" : "Create Customer"}</Button></Form.Item>
        </Form>
      </Modal>
      <Modal
        title="New Owner / 新增原车主"
        width={560}
        open={ownerCreateOpen}
        onCancel={() => setOwnerCreateOpen(false)}
        footer={null}
        destroyOnClose
        className="recordCreateModal"
      >
        <Form layout="vertical" className="modalForm" onFinish={(values) => {
          const owner: Owner = {
            id: newId(),
            name: values.name,
            phone: values.phone
          };
          const blockReason = ownerCreateBlockReason(owner, owners);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }

          onCreateOwner(owner);
          setOwnerCreateOpen(false);
        }}>
          <Form.Item name="name" label="Owner Name / 原车主姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Owner</Button></Form.Item>
        </Form>
      </Modal>
      <Drawer
        title="Customer Details / 客户详情"
        width={560}
        open={customerEditorOpen}
        onClose={() => setCustomerEditorOpen(false)}
        destroyOnClose
        className="recordEditDrawer"
      >
        <Form
          key={selectedCustomer?.id ?? "customer-edit-drawer"}
          layout="vertical"
          className="drawerForm"
          initialValues={selectedCustomer}
          onFinish={(values) => {
            if (!selectedCustomer) return;
            const customer: Customer = {
              ...selectedCustomer,
              name: values.name,
              phone: values.phone,
              icNumber: values.icNumber,
              email: values.email,
              address: values.address,
              notes: values.notes
            };
            const blockReason = customerCreateBlockReason(customer, customers);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }

            onUpdateCustomer(customer);
            setCustomerEditorOpen(false);
          }}
        >
          <Form.Item name="id" label="Selected Customer"><Select options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} onChange={selectCustomer} /></Form.Item>
          <Form.Item name="name" label="Customer Name / 客户姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="icNumber" label={shortformLabel("IC / 身份证", "Identity card number")}><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input /></Form.Item>
          <Form.Item name="address" label="Address / 地址"><Input placeholder="Customer address for invoice/delivery" /></Form.Item>
          <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Customer detail note" /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedCustomer}>Update Customer</Button></Form.Item>
        </Form>
      </Drawer>
      <Drawer
        title="Owner Details / 原车主详情"
        width={560}
        open={ownerEditorOpen}
        onClose={() => setOwnerEditorOpen(false)}
        destroyOnClose
        className="recordEditDrawer"
      >
        <Form
          key={selectedOwner?.id ?? "owner-edit-drawer"}
          layout="vertical"
          className="drawerForm"
          initialValues={selectedOwner}
          onFinish={(values) => {
            if (!selectedOwner) return;
            const owner: Owner = {
              ...selectedOwner,
              name: values.name,
              phone: values.phone
            };
            const blockReason = ownerCreateBlockReason(owner, owners);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }

            onUpdateOwner(owner);
            setOwnerEditorOpen(false);
          }}
        >
          <Form.Item name="id" label="Selected Owner"><Select options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} onChange={selectOwner} /></Form.Item>
          <Form.Item name="name" label="Owner Name / 原车主姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedOwner}>Update Owner</Button></Form.Item>
        </Form>
      </Drawer>
      {false && <ProCard title="Photo & Document Upload / 照片与文件上传">
        <Form layout="vertical" className="formGrid">
          <Form.Item label="Car Plate">
            <Select
              value={selectedVehicleId || undefined}
              placeholder="Select vehicle"
              options={vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plateNumber} - ${vehicle.make} ${vehicle.model}` }))}
              onChange={selectVehicle}
            />
          </Form.Item>
          <Form.Item label="Website Photo">
            <Upload
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadDisabled}
              multiple
              maxCount={12}
              showUploadList
              customRequest={(option) => {
                void onUploadPhoto(selectedVehicleId, option.file as File)
                  .then(async () => {
                    await loadUploads();
                    option.onSuccess?.({}, option.file);
                  })
                  .catch((error: Error) => option.onError?.(error));
              }}
            >
              <Button icon={<UploadOutlined />} disabled={uploadDisabled}>Upload Website Photos</Button>
            </Upload>
          </Form.Item>
          <Form.Item label="Document Type">
            <Select<DocumentCategory>
              value={documentCategory}
              onChange={setDocumentCategory}
              options={[
                    { value: "PurchaseInvoice", label: "Purchase Invoice" },
                    { value: "Voc", label: shortformLabel("VOC", "Vehicle ownership certificate") },
                    { value: "IdentityCard", label: shortformLabel("IC", "Customer identity card") },
                    { value: "ApDocument", label: shortformLabel("AP Document", "Approved permit document") },
                { value: "StatusReceipt", label: "Status Receipt" },
                { value: "LoanDocument", label: "Loan Document" },
                { value: "DeliveryDocument", label: "Delivery Document" },
                { value: "Policy", label: "Policy" },
                { value: "RoadTaxReceipt", label: "Road Tax Receipt" },
                { value: "RepairInvoice", label: "Repair Invoice" }
              ]}
            />
          </Form.Item>
          <Form.Item label="Document Upload">
            <Upload
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              disabled={uploadDisabled}
              multiple
              maxCount={12}
              showUploadList
              customRequest={(option) => {
                void onUploadDocument(selectedVehicleId, option.file as File, documentCategory)
                  .then(async () => {
                    await loadUploads();
                    option.onSuccess?.({}, option.file);
                  })
                  .catch((error: Error) => option.onError?.(error));
              }}
            >
              <Button icon={<UploadOutlined />} disabled={uploadDisabled}>Upload Documents</Button>
            </Upload>
          </Form.Item>
        </Form>
        <Table
          rowKey="id"
          columns={photoColumns}
          dataSource={photos}
          pagination={tablePagination(5)}
          scroll={{ x: 820 }}
        />
        <Table
          rowKey="id"
          columns={documentColumns}
          dataSource={documents}
          pagination={tablePagination(5)}
          scroll={{ x: 760 }}
        />
      </ProCard>}
    </Space>
  );
}

function ocrText(value: string | number | undefined, fallback: string) {
  const normalized = value === undefined || value === null ? "" : String(value).trim();
  return normalized || fallback;
}

function ocrOptionalText(value: string | number | undefined, fallback: string | undefined) {
  const normalized = value === undefined || value === null ? "" : String(value).trim();
  return normalized || fallback;
}

function tablePagination(pageSize = 8): TablePaginationConfig {
  return { pageSize, showSizeChanger: false };
}

function documentCategoryLabel(category: DocumentCategory) {
  return category
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (value) => value.toUpperCase())
    .trim();
}

function shortformLabel(label: string, title: string) {
  return (
    <Tooltip title={title}>
      <span>{label}</span>
    </Tooltip>
  );
}

function plateFor(vehicles: Vehicle[], vehicleId: string) {
  return vehicles.find((vehicle) => vehicle.id === vehicleId)?.plateNumber ?? "Unknown";
}

function contactFor<T extends { id: string; name: string; phone: string }>(contacts: T[], contactId?: string) {
  const contact = contacts.find((item) => item.id === contactId);
  return contact ? `${contact.name} / ${contact.phone}` : "-";
}

function ocrField(job: VehicleOcrJob, fieldName: string) {
  const value = job.result?.fields?.[fieldName];
  return value === undefined || value === null || value === "" ? undefined : String(value);
}

function ocrAmount(job: VehicleOcrJob) {
  const value = ocrField(job, "amount") ?? ocrField(job, "nettPrice") ?? ocrField(job, "salesPrice");
  if (!value) return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatMoney(numeric) : value;
}

function estimatedVehicleProfit(vehicle: Vehicle) {
  return vehicle.sellingPrice + vehicle.additionalCharges - vehicle.purchasePrice - vehicle.refurbishmentTotal - vehicle.commissionTotal - (vehicle.outstationPickupAllowance ?? 0);
}

function vehicleAgeInDays(vehicle: Pick<Vehicle, "intakeDate">, todayIsoDate: string) {
  if (!vehicle.intakeDate) return 0;
  const today = Date.parse(`${todayIsoDate}T00:00:00Z`);
  const intakeDate = Date.parse(`${vehicle.intakeDate}T00:00:00Z`);
  return Math.max(0, Math.floor((today - intakeDate) / (24 * 60 * 60 * 1000)));
}

function hasOutstationPickup(vehicle: Vehicle) {
  return Boolean(vehicle.outstationPickupScheduledAt || vehicle.outstationPickupAllowance || vehicle.outstationPickupBookingSlip);
}

function newId() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
