import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { ProCard, ProDescriptions, ProTable, ProConfigProvider, StepsForm } from "@ant-design/pro-components";
import type { ProColumns } from "@ant-design/pro-components";
import { enUSIntl } from "@ant-design/pro-provider";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import { Alert, Badge, Button, DatePicker, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Pagination, Select, Space, Switch, Table, Tabs, Tag, Tooltip, Typography, Upload, message } from "antd";
import type { FormInstance } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TablePaginationConfig } from "antd/es/table/interface";
import { customerCreateBlockReason, ownerCreateBlockReason } from "../../contacts";
import { singaporeTodayIsoDate, type DashboardVehicleFocus } from "../../dashboard";
import { isRepairCostFinal } from "../../repairs";
import { purchaseInvoiceCreateBlockReason, vehicleCreateBlockReason } from "../../vehicles";
import { OcrUploadReview, type OcrReviewValues } from "../shared/OcrUploadReview";
import { MarketingDescription } from "../../../../frontoffice/app/vehicles/MarketingDescription";
import { formatMoney, formatMoneyInput, parseMoneyInput } from "../../money";
import {
  customerSelectLabel,
  createVehicleCatalogModel,
  getVehicleDocuments,
  getVehicleCatalogModels,
  getVehicleOcrJobs,
  getVehiclePhotos,
  humanizeApiError,
  vehicleDocumentContentUrl,
  vehicleFromIntakeValues,
  vehiclePhotoContentUrl,
  type Customer,
  type BrokerCommission,
  type DashboardAnalyticsPeriod,
  type DocumentCategory,
  type DocumentOwnershipType,
  type DocumentUploadOwner,
  type Lead,
  type LoanApplication,
  type Owner,
  type PaymentVoucher,
  type PurchaseInvoice,
  type RepairJob,
  type Vehicle,
  type VehicleCatalogModel,
  type VehicleIntakeValues,
  type VehicleDocument,
  type VehicleOcrJob,
  type VehiclePhoto
} from "../../api";

const maxWebsitePhotoBytes = 5 * 1024 * 1024;
const vehicleIntakeDocumentCategories: DocumentCategory[] = ["Voc", "IdentityCard", "ApDocument"];
const receiptInvoiceDocumentCategories: DocumentCategory[] = ["PurchaseInvoice", "RepairInvoice", "PaymentReceipt", "PaymentInvoice"];
const mobileVehiclePageSize = 12;
const earliestVehicleYear = 1990;
const latestVehicleYear = new Date().getFullYear() + 1;
export type VehicleIntakeDraft = Partial<Omit<Vehicle, "id">>;

export function vehicleDocumentOwnershipDefault(category: DocumentCategory): DocumentOwnershipType {
  switch (category) {
    case "PurchaseInvoice":
    case "Voc":
    case "ApDocument":
      return "Seller";
    case "IdentityCard":
    case "LoanDocument":
    case "DeliveryDocument":
    case "Policy":
      return "Buyer";
    default:
      return "Vehicle";
  }
}

export function vehicleDocumentAllowsPersonSelection(category: DocumentCategory) {
  return ["PurchaseInvoice", "Voc", "IdentityCard", "ApDocument", "LoanDocument", "DeliveryDocument", "Policy"].includes(category);
}

const vehicleDocumentCategoriesByOwnership: Record<DocumentOwnershipType, DocumentCategory[]> = {
  Seller: ["PurchaseInvoice", "Voc", "IdentityCard", "ApDocument"],
  Buyer: ["IdentityCard", "LoanDocument", "DeliveryDocument", "Policy"],
  Vehicle: ["StatusReceipt", "RoadTaxReceipt", "RepairInvoice"]
};

export function vehicleDocumentCategoriesForOwnership(ownershipType: DocumentOwnershipType, documents: VehicleDocument[] = []) {
  const configured = vehicleDocumentCategoriesByOwnership[ownershipType];
  const storedCategories = documents
    .filter((document) => document.ownershipType === ownershipType && !configured.includes(document.category))
    .map((document) => document.category);
  return Array.from(new Set([...configured, ...storedCategories]));
}

export function vehicleDocumentsForOwnership(documents: VehicleDocument[], ownershipType: DocumentOwnershipType, category: DocumentCategory) {
  return documents.filter((document) => document.ownershipType === ownershipType && document.category === category);
}

function VehicleMakeModelFields({
  catalogModels,
  onCreateCatalogModel
}: {
  catalogModels: VehicleCatalogModel[];
  onCreateCatalogModel: (make: string, model: string) => Promise<boolean>;
}) {
  const form = Form.useFormInstance();
  const selectedMake = Form.useWatch("make", form);
  const [makeSearch, setMakeSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [creatingModel, setCreatingModel] = useState(false);
  const makeOptions = useMemo(
    () => Array.from(new Set(catalogModels.filter((item) => item.isActive).map((item) => item.make)))
      .sort((left, right) => left.localeCompare(right))
      .map((make) => ({ value: make, label: make })),
    [catalogModels]
  );
  const modelOptions = useMemo(
    () => catalogModels
      .filter((item) => item.isActive && item.make.toLocaleLowerCase() === selectedMake?.toLocaleLowerCase())
      .sort((left, right) => left.model.localeCompare(right.model))
      .map((item) => ({ value: item.model, label: item.model })),
    [catalogModels, selectedMake]
  );
  const trimmedMakeSearch = makeSearch.trim();
  const trimmedModelSearch = modelSearch.trim();
  const hasMatchingMake = makeOptions.some((option) => option.value.toLocaleLowerCase() === trimmedMakeSearch.toLocaleLowerCase());
  const hasMatchingModel = modelOptions.some((option) => option.value.toLocaleLowerCase() === trimmedModelSearch.toLocaleLowerCase());

  async function addModel() {
    if (!selectedMake || !trimmedModelSearch) return;
    setCreatingModel(true);
    try {
      if (await onCreateCatalogModel(selectedMake, trimmedModelSearch)) {
        form.setFieldsValue({ model: trimmedModelSearch });
        setModelSearch("");
      }
    } finally {
      setCreatingModel(false);
    }
  }

  return (
    <>
      <Form.Item name="make" label="Make" rules={[{ required: true, message: "Select or add a make" }]}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Search make"
          options={makeOptions}
          onSearch={setMakeSearch}
          onChange={() => form.setFieldValue("model", undefined)}
          dropdownRender={(menu) => (
            <>
              {menu}
              {trimmedMakeSearch && !hasMatchingMake && (
                <Button
                  type="text"
                  block
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    form.setFieldsValue({ make: trimmedMakeSearch, model: undefined });
                    setMakeSearch("");
                  }}
                >
                  Use new make “{trimmedMakeSearch}”
                </Button>
              )}
            </>
          )}
        />
      </Form.Item>
      <Form.Item name="model" label="Model" rules={[{ required: true, message: "Select or add a model" }]}>
        <Select
          disabled={!selectedMake}
          showSearch
          optionFilterProp="label"
          placeholder={selectedMake ? "Search model" : "Select a make first"}
          options={modelOptions}
          onSearch={setModelSearch}
          dropdownRender={(menu) => (
            <>
              {menu}
              {selectedMake && trimmedModelSearch && !hasMatchingModel && (
                <Button
                  type="text"
                  block
                  loading={creatingModel}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void addModel()}
                >
                  Add “{trimmedModelSearch}” to {selectedMake}
                </Button>
              )}
            </>
          )}
        />
      </Form.Item>
    </>
  );
}

export function vehicleFromCreateIntakeValues(values: VehicleIntakeDraft, canApproveVehicles: boolean, id: string): Vehicle {
  const bossConfirmed = canApproveVehicles ? Boolean(values.bossConfirmed) : false;
  return vehicleFromIntakeValues({
    ...values,
    stockOwner: values.stockOwner || "YSHeng",
    status: "Available",
    bossConfirmed,
    isPublic: false
  } as VehicleIntakeValues, id);
}

function VehicleIntakeReview({ draft, customers, owners }: { draft: VehicleIntakeDraft; customers: Customer[]; owners: Owner[] }) {
  const displayValue = (value: unknown) => value === undefined || value === "" || value === null ? "Not provided" : String(value);
  const customer = customers.find((item) => item.id === draft.customerId);
  const owner = owners.find((item) => item.id === draft.ownerId);

  return (
    <Space direction="vertical" size={12} className="fullWidth">
      <Alert
        type="info"
        showIcon
        message="Review the intake before creating the vehicle"
        description="The vehicle will start as Available. Management approval and website visibility remain subject to your role and the workflow rules."
      />
      <ProDescriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
        <ProDescriptions.Item label="Plate / 车牌">{displayValue(draft.plateNumber)}</ProDescriptions.Item>
        <ProDescriptions.Item label="Vehicle / 车辆">{[draft.make, draft.model, draft.year].filter(Boolean).join(" ") || "Not provided"}</ProDescriptions.Item>
        <ProDescriptions.Item label="Purchase / 收车价">{formatMoney(Number(draft.purchasePrice ?? 0))}</ProDescriptions.Item>
        <ProDescriptions.Item label="Selling / 售价">{formatMoney(Number(draft.sellingPrice ?? 0))}</ProDescriptions.Item>
        <ProDescriptions.Item label="Customer / 客户">{customer ? customerSelectLabel(customer) : "Not selected"}</ProDescriptions.Item>
        <ProDescriptions.Item label="Owner / 原车主">{owner ? `${owner.name} / ${owner.phone}` : "Not selected"}</ProDescriptions.Item>
      </ProDescriptions>
    </Space>
  );
}

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

export function vehicleLoanHandoffBuyerPolicy(vehicle: Pick<Vehicle, "customerId">) {
  return {
    locked: Boolean(vehicle.customerId),
    allowedCustomerIds: vehicle.customerId ? [vehicle.customerId] : []
  };
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

export function vehicleDetailsPersonCreateFlags(target: "customer" | "owner") {
  return {
    customer: target === "customer",
    owner: target === "owner"
  };
}

export const vehicleStatusLabel: Record<Vehicle["status"], string> = {
  Available: "Available",
  LoanProcessing: "Loan in progress",
  Sold: "Sold"
};

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
  repairs,
  brokerCommissions = [],
  paymentVouchers = [],
  canApproveVehicles,
  dashboardFocus,
  dashboardAnalyticsPeriod,
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
  repairs: RepairJob[];
  brokerCommissions?: BrokerCommission[];
  paymentVouchers?: PaymentVoucher[];
  canApproveVehicles: boolean;
  dashboardFocus?: DashboardVehicleFocus;
  dashboardAnalyticsPeriod?: DashboardAnalyticsPeriod;
  onClearDashboardFocus: () => void;
  onCreate: (vehicle: Vehicle) => Promise<void>;
  onUpdate: (vehicle: Vehicle) => Promise<void>;
  onStartLoan: (vehicle: Vehicle) => Promise<void>;
  onOpenCustomer: (customerId: string) => void;
  onCreateCustomer: (customer: Customer) => Promise<void>;
  onUpdateCustomer: (customer: Customer) => void;
  onCreateOwner: (owner: Owner) => Promise<void>;
  onUpdateOwner: (owner: Owner) => void;
  onCreatePurchaseInvoice: (invoice: PurchaseInvoice) => Promise<void>;
  onUpdatePurchaseInvoice: (invoice: PurchaseInvoice) => Promise<void>;
  onUploadPhoto: (vehicleId: string, file: File) => Promise<void>;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory, owner?: DocumentUploadOwner) => Promise<void>;
}) {
  const [uploadVehicleId, setUploadVehicleId] = useState(vehicles[0]?.id ?? "");
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>("IdentityCard");
  const [documentOwnershipTab, setDocumentOwnershipTab] = useState<DocumentOwnershipType>("Buyer");
  const [documentPersonId, setDocumentPersonId] = useState("");
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [ocrJobs, setOcrJobs] = useState<VehicleOcrJob[]>([]);
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [catalogModels, setCatalogModels] = useState<VehicleCatalogModel[]>([]);
  const [editVehicleId, setEditVehicleId] = useState(vehicles[0]?.id ?? "");
  const [editPurchaseInvoiceId, setEditPurchaseInvoiceId] = useState(purchaseInvoices[0]?.id ?? "");
  const [editCustomerId, setEditCustomerId] = useState(customers[0]?.id ?? "");
  const [editOwnerId, setEditOwnerId] = useState(owners[0]?.id ?? "");
  const [purchaseInvoiceEditorOpen, setPurchaseInvoiceEditorOpen] = useState(false);
  const [customerEditorOpen, setCustomerEditorOpen] = useState(false);
  const [ownerEditorOpen, setOwnerEditorOpen] = useState(false);
  const [vehicleDetailOpen, setVehicleDetailOpen] = useState(false);
  const [vehicleDetailTab, setVehicleDetailTab] = useState("overview");
  const [vehicleAssetTab, setVehicleAssetTab] = useState("documents");
  const [vehicleCreateOpen, setVehicleCreateOpen] = useState(false);
  const [vehicleIntakeDraft, setVehicleIntakeDraft] = useState<VehicleIntakeDraft>({});
  const [purchaseInvoiceCreateOpen, setPurchaseInvoiceCreateOpen] = useState(false);
  const [purchaseInvoiceOcrDraft, setPurchaseInvoiceOcrDraft] = useState<OcrReviewValues | null>(null);
  const [customerCreateOpen, setCustomerCreateOpen] = useState(false);
  const [customerCreateForLoanVehicleId, setCustomerCreateForLoanVehicleId] = useState("");
  const [customerCreateForVehicleIntake, setCustomerCreateForVehicleIntake] = useState(false);
  const [customerCreateForVehicleDetails, setCustomerCreateForVehicleDetails] = useState(false);
  const [customerCreating, setCustomerCreating] = useState(false);
  const [ownerCreateOpen, setOwnerCreateOpen] = useState(false);
  const [ownerCreateForVehicleIntake, setOwnerCreateForVehicleIntake] = useState(false);
  const [ownerCreateForVehicleDetails, setOwnerCreateForVehicleDetails] = useState(false);
  const [loanHandoffVehicleId, setLoanHandoffVehicleId] = useState("");
  const [loanHandoffCustomerId, setLoanHandoffCustomerId] = useState("");
  const [loanHandoffSubmitting, setLoanHandoffSubmitting] = useState(false);
  const [loanHandoffForm] = Form.useForm<{ customerId: string }>();
  const vehicleCreateFormRef = useRef<FormInstance | undefined>(undefined);
  const [operationFilters, setOperationFilters] = useState<OperationIntakeVehicleFilters>({});
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [mobileVehiclePage, setMobileVehiclePage] = useState(1);
  const selectedVehicleId = uploadVehicleId || vehicles[0]?.id || "";
  const uploadDisabled = !selectedVehicleId;

  const loadCatalogModels = useCallback(async () => {
    try {
      setCatalogModels(await getVehicleCatalogModels());
    } catch (error) {
      message.error(humanizeApiError(error, "Unable to load the vehicle catalogue."));
    }
  }, []);

  const addVehicleCatalogModel = useCallback(async (make: string, model: string) => {
    try {
      const created = await createVehicleCatalogModel({ make, model, isActive: true });
      setCatalogModels((items) => [...items, created]);
      message.success(`${created.make} ${created.model} added to the vehicle catalogue.`);
      return true;
    } catch (error) {
      message.error(humanizeApiError(error, "Unable to add the vehicle catalogue option."));
      return false;
    }
  }, []);

  useEffect(() => {
    void loadCatalogModels();
  }, [loadCatalogModels]);
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
  const personOwnedDocument = documentOwnershipTab !== "Vehicle" && vehicleDocumentAllowsPersonSelection(documentCategory);
  const selectedDocumentPerson = documentOwnershipTab === "Seller" ? selectedVehicleOwner : documentOwnershipTab === "Buyer" ? selectedVehicleCustomer : undefined;
  const documentOwnershipReady = !personOwnedDocument || Boolean(selectedDocumentPerson && selectedDocumentPerson.id === documentPersonId);
  const documentUploadOwner: DocumentUploadOwner = personOwnedDocument
    ? documentOwnershipTab === "Seller"
      ? { ownershipType: "Seller", ownerId: documentPersonId }
      : { ownershipType: "Buyer", customerId: documentPersonId }
    : { ownershipType: "Vehicle" };
  useEffect(() => {
    const defaultOwnership = documentCategory === "IdentityCard" ? documentOwnershipTab : vehicleDocumentOwnershipDefault(documentCategory);
    const linkedPerson = defaultOwnership === "Seller" ? selectedVehicleOwner : defaultOwnership === "Buyer" ? selectedVehicleCustomer : undefined;
    setDocumentPersonId(linkedPerson?.id ?? "");
  }, [documentCategory, documentOwnershipTab, selectedVehicle?.id, selectedVehicle?.customerId, selectedVehicle?.ownerId]);
  const loanHandoffVehicle = vehicles.find((vehicle) => vehicle.id === loanHandoffVehicleId);
  const loanHandoffStep = loanHandoffVehicle ? vehicleLoanHandoffStep(loanHandoffVehicle) : undefined;
  const loanHandoffBuyerPolicy = loanHandoffVehicle ? vehicleLoanHandoffBuyerPolicy(loanHandoffVehicle) : { locked: false, allowedCustomerIds: [] };
  const loanHandoffCustomerOptions = loanHandoffBuyerPolicy.allowedCustomerIds.length > 0
    ? customers.filter((customer) => loanHandoffBuyerPolicy.allowedCustomerIds.includes(customer.id))
    : customers;
  const availableVehicles = vehicles.filter((vehicle) => vehicle.status === "Available").length;
  const publicVehicles = vehicles.filter((vehicle) => vehicle.isPublic).length;
  const pendingBossConfirmation = vehicles.filter((vehicle) => !vehicle.bossConfirmed).length;
  const repairCostFor = (vehicle: Vehicle) => effectiveRepairCost(vehicle, repairs);
  const commissionCostFor = (vehicle: Vehicle) => effectiveCommissionCost(vehicle, brokerCommissions);
  const pickupAllowanceCostFor = (vehicle: Vehicle) => effectivePickupAllowanceCost(vehicle, paymentVouchers);
  const profitFor = (vehicle: Vehicle) => estimatedVehicleProfit(vehicle, repairCostFor(vehicle), commissionCostFor(vehicle), pickupAllowanceCostFor(vehicle));
  const dashboardFocusedVehicles = filterVehiclesForDashboardFocus(vehicles, dashboardFocus, dashboardAnalyticsPeriod);
  const filteredVehicles = filterOperationIntakeVehicles(dashboardFocusedVehicles, purchaseInvoices, leads, operationFilters)
    .sort((left, right) => dashboardFocus === "profit" ? profitFor(right) - profitFor(left) : 0);
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
    ? profitFor(selectedVehicle)
    : 0;
  const selectedWorkflow = selectedVehicle ? getVehicleWorkflowState(selectedVehicle) : undefined;
  const selectedVehicleInvoiceCount = selectedVehicleInvoices.length;
  const selectedVehicleDocumentCount = documents.length;
  const receiptInvoiceOcrJobs = ocrJobs.filter((job) => receiptInvoiceDocumentCategories.includes(job.category));
  const selectedVehicleCaptureCount = receiptInvoiceOcrJobs.length;
  const selectedVehiclePhotoCount = photos.length;
  const selectedVehicleMissingDocuments = vehicleIntakeDocumentCategories.filter((category) => !documents.some((document) => document.category === category));
  const selectedVehicleUploadReminders = [
    ...vehicleIntakeDocumentCategories.map((category) => ({
      label: documentCategoryLabel(category),
      isPresent: !selectedVehicleMissingDocuments.includes(category)
    })),
    { label: "Website photos", isPresent: selectedVehiclePhotoCount > 0 }
  ];
  const documentCategories = vehicleDocumentCategoriesForOwnership(documentOwnershipTab, documents);
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

  const selectDocumentOwnershipTab = (ownershipType: DocumentOwnershipType) => {
    setDocumentOwnershipTab(ownershipType);
    const categories = vehicleDocumentCategoriesForOwnership(ownershipType, documents);
    if (!categories.includes(documentCategory)) setDocumentCategory(categories[0]);
  };

  const openVehicleDetails = (vehicleId: string) => {
    selectVehicle(vehicleId);
    setVehicleDetailTab("overview");
    setVehicleAssetTab("documents");
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

  const approveVehicle = async (vehicle: Vehicle) => {
    if (!canApproveVehicles || vehicle.bossConfirmed) return;
    await onUpdate({ ...vehicle, bossConfirmed: true, isPublic: false });
    message.success("Vehicle approved.");
  };

  const renderVehicleActions = (vehicle: Vehicle) => (
    <Space className="tableActionGroup vehicleActionGroup" wrap size={6}>
      <Button size="small" type="primary" onClick={() => openVehicleDetails(vehicle.id)}>Details</Button>
      {canApproveVehicles && !vehicle.bossConfirmed ? <Button size="small" onClick={() => void approveVehicle(vehicle)}>Approve / 批准</Button> : null}
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

  const openVehicleDetailsPersonCreate = (target: "customer" | "owner") => {
    const flags = vehicleDetailsPersonCreateFlags(target);
    setCustomerCreateForVehicleDetails(flags.customer);
    setOwnerCreateForVehicleDetails(flags.owner);
    if (target === "customer") {
      setCustomerCreateOpen(true);
    } else {
      setOwnerCreateOpen(true);
    }
  };

  const loadUploads = useCallback(async () => {
    if (!selectedVehicleId) {
      setDocuments([]);
      setOcrJobs([]);
      setPhotos([]);
      return;
    }
    const [photoData, documentData, ocrJobData] = await Promise.all([
      getVehiclePhotos(selectedVehicleId),
      getVehicleDocuments(selectedVehicleId),
      getVehicleOcrJobs(selectedVehicleId)
    ]);
    setPhotos(photoData);
    setDocuments(documentData);
    setOcrJobs(ocrJobData);
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
    { title: "Contra Range / Contra 价格", dataIndex: "contraRangePrice", render: (value) => formatMoney(Number(value ?? 0)) },
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
      title: "Purchase Cost / 收车成本",
      dataIndex: "purchasePrice",
      width: 130,
      sorter: (a, b) => a.purchasePrice - b.purchasePrice,
      render: (value) => formatMoney(Number(value ?? 0))
    },
    {
      title: "Repair Cost / 整备费用",
      width: 130,
      sorter: (a, b) => repairCostFor(a) - repairCostFor(b),
      render: (_, row) => formatMoney(repairCostFor(row))
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
      sorter: (a, b) => profitFor(a) - profitFor(b),
      render: (_, row) => formatMoney(profitFor(row))
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
      title: "Active Enquiries / 活跃询盘",
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
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Tag color={vehicleStatusColor[row.status]}>{vehicleStatusLabel[row.status]}</Tag>
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

  const compactOperationIntakeColumns: ProColumns<Vehicle>[] = [
    {
      title: "Plate / 车牌",
      dataIndex: "plateNumber",
      fixed: "left",
      width: 220,
      sorter: (a, b) => a.plateNumber.localeCompare(b.plateNumber),
      filters: textFilters(vehicles.map((vehicle) => vehicle.plateNumber)),
      filterSearch: true,
      onFilter: (value, row) => row.plateNumber === value,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text type="secondary">{row.plateNumber}</Typography.Text>
          <Typography.Text strong>{vehicleName(row)}</Typography.Text>
        </Space>
      )
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
      title: "Model / 车型",
      dataIndex: "model",
      hideInTable: true,
      valueType: "text"
    },
    {
      title: "Year / 年份",
      dataIndex: "year",
      hideInTable: true,
      valueType: "digit"
    },
    {
      title: "Purchase Cost / 收车成本",
      dataIndex: "purchasePrice",
      width: 130,
      sorter: (a, b) => a.purchasePrice - b.purchasePrice,
      render: (_, row) => formatMoney(Number(row.purchasePrice ?? 0))
    },
    {
      title: "Repair Cost / 整备费用",
      width: 130,
      sorter: (a, b) => repairCostFor(a) - repairCostFor(b),
      render: (_, row) => formatMoney(repairCostFor(row))
    },
    {
      title: "Selling / 售价",
      dataIndex: "sellingPrice",
      width: 130,
      sorter: (a, b) => a.sellingPrice - b.sellingPrice,
      render: (_, row) => formatMoney(Number(row.sellingPrice ?? 0))
    },
    {
      title: "Est. Profit / 预估利润",
      width: 140,
      sorter: (a, b) => profitFor(a) - profitFor(b),
      render: (_, row) => formatMoney(profitFor(row))
    },
    {
      title: "Status / 状态",
      dataIndex: "status",
      width: 150,
      valueType: "select",
      valueEnum: { Available: "Available", LoanProcessing: "Loan processing", Sold: "Sold" },
      filters: ["Available", "LoanProcessing", "Sold"].map((value) => ({ text: value, value })),
      onFilter: (value, row) => row.status === value,
      render: (_, row) => <Tag color={vehicleStatusColor[row.status]}>{vehicleStatusLabel[row.status]}</Tag>
    },
    {
      title: "Readiness / 准备情况",
      width: 240,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Typography.Text type="secondary">Approval: {row.bossConfirmed ? "Approved" : "Needs approval"}</Typography.Text>
          <Typography.Text type="secondary">Website: {row.isPublic ? "Visible" : "Not published"}</Typography.Text>
          <Typography.Text type="secondary">Invoice: {invoiceCountForVehicle(row.id) > 0 ? "Linked" : "Missing"}</Typography.Text>
          <Typography.Text type="secondary">Buyer: {row.customerId ? "Linked" : "Missing"}</Typography.Text>
          <Typography.Text type="secondary">Used-car team: {row.ucdStatus || "Status not set"}</Typography.Text>
        </Space>
      )
    },
    {
      title: "Enquiries / 询盘",
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
    { title: "Uploaded / 日期时间", dataIndex: "uploadedAt", render: (value) => formatDocumentTimestamp(value) },
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
    {
      title: "Ownership / 归属",
      render: (_, row) => documentOwnershipLabel(row, customers, owners)
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
    { title: "Captured / 日期时间", dataIndex: "createdAt", render: (value) => formatDocumentTimestamp(value) },
    { title: "Type / 类型", dataIndex: "category", render: (value) => <Tag>{value}</Tag> },
    { title: "File / 文件", render: (_, row) => row.document?.fileName ?? "-" },
    { title: "Ownership / 归属", render: (_, row) => documentOwnershipLabel(row.document, customers, owners) },
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
    { title: "Uploaded / 日期时间", dataIndex: "uploadedAt", render: (value) => formatDocumentTimestamp(value) },
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

  const selectedDocumentHistory = vehicleDocumentsForOwnership(documents, documentOwnershipTab, documentCategory);
  const documentMobileCards = (
    <div className="mobileRecordList vehicleDocumentMobileList">
      {selectedDocumentHistory.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No documents of this type uploaded yet" />}
      {selectedDocumentHistory.map((document) => (
        <article className="mobileRecordCard" key={document.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">Document</Typography.Text>
              <Typography.Title level={5}>{document.fileName}</Typography.Title>
            </div>
            <Tag>{document.category}</Tag>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Uploaded / 上传时间</span><strong>{formatDocumentTimestamp(document.uploadedAt)}</strong></div>
            <div><span>Uploaded By</span><strong>{document.uploadedBy || "System"}</strong></div>
            <div><span>Ownership / 归属</span><strong>{documentOwnershipLabel(document, customers, owners)}</strong></div>
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
      {receiptInvoiceOcrJobs.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No captured receipt or invoice data yet" />}
      {receiptInvoiceOcrJobs.map((job) => (
        <article className="mobileRecordCard" key={job.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">Captured Data</Typography.Text>
              <Typography.Title level={5}>{job.document?.fileName ?? job.category}</Typography.Title>
            </div>
            <Tag>{job.category}</Tag>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Ownership / 归属</span><strong>{documentOwnershipLabel(job.document, customers, owners)}</strong></div>
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
  const captureVehicleIntakeStep = async (values: VehicleIntakeDraft) => {
    setVehicleIntakeDraft((current) => ({ ...current, ...values }));
    return true;
  };
  const closeVehicleCreate = () => {
    setVehicleCreateOpen(false);
    setVehicleIntakeDraft({});
  };
  return (
    <Space direction="vertical" size={16} className="fullWidth vehiclesPage">
      <ProCard
        title="Vehicle Inventory / 车辆库存"
        extra={<Space><Tag color="green">{vehicles.length} vehicles</Tag><Button type="primary" onClick={() => { setVehicleIntakeDraft({}); setVehicleCreateOpen(true); }}>New Vehicle</Button></Space>}
      >
        {dashboardFocus && <Alert
          type="info"
          showIcon
          message={dashboardFocus === "stock" ? "Dashboard focus: current stock" : dashboardFocus === "sold" ? `Dashboard focus: sold vehicles${dashboardAnalyticsPeriod?.from && dashboardAnalyticsPeriod.to ? ` from ${dashboardAnalyticsPeriod.from} to ${dashboardAnalyticsPeriod.to}` : ""}` : dashboardFocus === "fresh" ? "Dashboard focus: stock aged 0-30 days" : dashboardFocus === "watch" ? "Dashboard focus: stock aged 31-60 days" : dashboardFocus === "aging" ? "Dashboard focus: stock aged more than 60 days" : "Dashboard focus: vehicles ordered by estimated profit"}
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
                  <small>Active enquiries / 活跃询盘</small>
                  <strong>{activeLeadCountForVehicle(vehicle.id)}</strong>
                </span>
              </div>
              <div className="mobileRecordSection">
                <Typography.Text className="mobileRecordLabel">Cost & margin / 成本与利润</Typography.Text>
                <div className="mobileRecordMeta">
                  <span><small>Purchase Cost / 收车成本</small><strong>{formatMoney(vehicle.purchasePrice)}</strong></span>
                  <span><small>Repair Cost / 整备费用</small><strong>{formatMoney(repairCostFor(vehicle))}</strong></span>
                  <span><small>Selling / 售价</small><strong>{formatMoney(vehicle.sellingPrice)}</strong></span>
                  <span><small>Est. Profit / 预估利润</small><strong>{formatMoney(profitFor(vehicle))}</strong></span>
                </div>
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
        <ProConfigProvider intl={enUSIntl}>
        <ProTable<Vehicle>
          className="desktopDataTable"
          rowKey="id"
          columns={compactOperationIntakeColumns}
          dataSource={filteredVehicles}
          search={{ labelWidth: 120, defaultCollapsed: false, span: 6 }}
          options={{ reload: false, density: false, setting: false, fullScreen: false }}
          cardBordered={false}
          onSubmit={(params) => {
            const searchTerms = [params.plateNumber, params.model, params.year].filter((value) => value !== undefined && value !== "").map(String);
            updateOperationFilter("keyword", searchTerms.length > 0 ? searchTerms.join(" ") : undefined);
            updateOperationFilter("status", typeof params.status === "string" ? params.status as Vehicle["status"] : undefined);
            return Promise.resolve();
          }}
          onReset={() => {
            updateOperationFilter("keyword", undefined);
            updateOperationFilter("status", undefined);
          }}
          pagination={{ ...tablePagination(8), current: clampedMobileVehiclePage, onChange: setMobileVehiclePage }}
          scroll={{ x: 1650 }}
          rowClassName={(row) => row.id === selectedVehicle?.id ? "selectedVehicleRow" : ""}
          onRow={(row) => ({
            onClick: () => selectVehicle(row.id)
          })}
          locale={{ emptyText: "No vehicles match the current filters." }}
        />
        </ProConfigProvider>
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
                extra={loanHandoffBuyerPolicy.locked ? "This is the vehicle's linked buyer. To use a different buyer after a rejected loan, close this dialog and update Customer in Vehicle Record first." : undefined}
                rules={[{ required: true, message: "Select the confirmed buyer before starting the loan." }]}
              >
                <Select
                  disabled={loanHandoffBuyerPolicy.locked}
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select customer"
                  options={loanHandoffCustomerOptions.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))}
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
        <Tabs
          activeKey={vehicleDetailTab}
          onChange={setVehicleDetailTab}
          items={[
            { key: "overview", label: "Overview" },
            { key: "vehicle", label: "Vehicle details" },
            { key: "people", label: "Linked people & leads" },
            { key: "documents", label: "Documents & photos" }
          ]}
        />
        <Space direction="vertical" size={16} className="fullWidth">
          <div hidden={vehicleDetailTab !== "overview"}>
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
            </Space>
          </div>
          <div hidden={vehicleDetailTab !== "vehicle"}>
            <Space direction="vertical" size={16} className="fullWidth">
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
                const bossConfirmed = Boolean(selectedVehicle.bossConfirmed);
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
              <Form.Item
                className="vehicleVisibilityToggle"
                name="isPublic"
                label="Website Visible / 网站展示"
                valuePropName="checked"
                extra={!selectedVehicle?.bossConfirmed && !canApproveVehicles ? "Website visibility stays hidden until Boss/Admin approval." : undefined}
              >
                <Switch checkedChildren="Visible" unCheckedChildren="Hidden" disabled={!canApproveVehicles && !selectedVehicle?.bossConfirmed} />
              </Form.Item>
              <Form.Item
                name="plateNumber"
                label="Plate / 车牌"
                normalize={(value: string) => value?.toUpperCase()}
                rules={[
                  { required: true, message: "Enter the car plate." },
                  { pattern: /^[A-Z0-9]+$/, message: "Use letters and numbers only, with no spaces or symbols." }
                ]}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="chassisNumber" label="Chassis Number"><Input /></Form.Item>
              <Form.Item name="engineNumber" label="Engine Number"><Input /></Form.Item>
              <Form.Item name="make" label="Make"><Input placeholder="Toyota" /></Form.Item>
              <Form.Item name="model" label="Model"><Input placeholder="Vios" /></Form.Item>
              <Form.Item
                name="year"
                label="Year"
                rules={[
                  { required: true, message: "Enter the vehicle year." },
                  { type: "number", min: earliestVehicleYear, max: latestVehicleYear, message: `Enter a year from ${earliestVehicleYear} to ${latestVehicleYear}.` }
                ]}
              >
                <InputNumber className="fullWidth" min={earliestVehicleYear} max={latestVehicleYear} precision={0} step={1} />
              </Form.Item>
              <Form.Item name="purchasePrice" label="Purchase / 收车价"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
              <Form.Item name="sellingPrice" label="Selling / 售价"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
              <Form.Item name="contraRangePrice" label="Contra Range Price / Contra 价格范围"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
              <Form.Item name="additionalCharges" label="Additional Charges / 杂费"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
              <Form.Item name="refurbishmentTotal" label="Refurbishment Total / 整备预算"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
              <Form.Item name="commissionTotal" label="Commission / 佣金"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
              <Form.Item name="outstationPickupAllowance" label="Outstation Pickup Allowance / 外地收车津贴"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
              <Form.Item
                name="outstationPickupScheduledAt"
                label="Outstation Pickup Date & Time / 外地收车时间"
                getValueProps={(value?: string) => ({ value: value ? dayjs(value) : null })}
                normalize={(value: Dayjs | null) => value?.toISOString()}
              >
                <DatePicker className="fullWidth" showTime={{ format: "HH:mm", minuteStep: 5 }} format="DD MMM YYYY, HH:mm" placeholder="Select date and time" />
              </Form.Item>
              <Form.Item name="outstationPickupBookingSlip" label="Booking Slip Reference / 预约单参考编号"><Input placeholder="Booking slip no. or file ref" /></Form.Item>
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
          </Space>
          </div>
          <div hidden={vehicleDetailTab !== "people"}>
            <Space direction="vertical" size={16} className="fullWidth">
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
                  <Button onClick={() => openVehicleDetailsPersonCreate("customer")}>New Customer</Button>
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
                  <Button onClick={() => openVehicleDetailsPersonCreate("owner")}>New Owner</Button>
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
            </Space>
          </div>
          <div hidden={vehicleDetailTab !== "documents"}>
          <ProCard title="Photo & Document Upload / 照片与文件上传">
            <Tabs
              activeKey={vehicleAssetTab}
              onChange={setVehicleAssetTab}
              items={[
                { key: "documents", label: "Documents" },
                { key: "photos", label: "Website photos" }
              ]}
            />
            <Form layout="vertical" className="formGrid vehicleUploadForm">
              <div hidden={vehicleAssetTab !== "photos"}>
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
              </div>
              <div hidden={vehicleAssetTab !== "documents"}>
              <div className="vehicleDocumentSection">
                <Typography.Text className="moduleEyebrow">Add a vehicle document</Typography.Text>
                <Typography.Text type="secondary">Choose a document type to add it and view its own history. IC and VOC photos open a review before anything is saved.</Typography.Text>
              </div>
              {selectedVehicleUploadReminders.length > 0 && (
                <Alert
                  type="info"
                  showIcon
                  message="Optional documents"
                  description="VOC, IC, and AP documents can be added here when they are available."
                />
              )}
              <Tabs
                activeKey={documentOwnershipTab}
                onChange={(key) => selectDocumentOwnershipTab(key as DocumentOwnershipType)}
                items={[
                  { key: "Seller", label: "Seller / Original owner" },
                  { key: "Buyer", label: "Buyer / Customer" },
                  { key: "Vehicle", label: "Vehicle / 车辆" }
                ]}
              />
              <Form.Item label="Document Type">
                <Space wrap>
                  {documentCategories.map((category) => (
                    <Button key={category} type={documentCategory === category ? "primary" : "default"} onClick={() => setDocumentCategory(category)}>
                      {category === "Voc" ? shortformLabel("VOC", "Vehicle ownership certificate") : category === "IdentityCard" ? shortformLabel("IC", "Identity card") : category === "ApDocument" ? shortformLabel("AP Document", "Approved permit document") : documentCategoryLabel(category)}
                    </Button>
                  ))}
                </Space>
              </Form.Item>
              {personOwnedDocument ? (
                <Space direction="vertical" size={0} className="fullWidth">
                  <Form.Item
                    label="Document owner / 文件归属"
                    extra="The active ownership tab is saved with the document and is not changed by OCR review."
                  >
                    <Tag color={documentOwnershipTab === "Seller" ? "gold" : "blue"}>
                      {documentOwnershipTab === "Seller" ? "Seller / Original owner" : "Buyer / Customer"}
                    </Tag>
                  </Form.Item>
                  <Form.Item label={documentOwnershipTab === "Seller" ? "Seller / Original owner" : "Buyer / Customer"}>
                    <Select
                      value={documentPersonId || undefined}
                      placeholder="Select the linked person"
                      onChange={setDocumentPersonId}
                      options={documentOwnershipTab === "Seller"
                        ? selectedVehicleOwner ? [{ value: selectedVehicleOwner.id, label: `${selectedVehicleOwner.name} / ${selectedVehicleOwner.phone}` }] : []
                        : selectedVehicleCustomer ? [{ value: selectedVehicleCustomer.id, label: `${selectedVehicleCustomer.name} / ${selectedVehicleCustomer.phone}` }] : []}
                    />
                  </Form.Item>
                  {!selectedDocumentPerson && (
                    <Alert
                      type="info"
                      showIcon
                      message={`Link a ${documentOwnershipTab === "Seller" ? "seller / original owner" : "buyer / customer"} before uploading`}
                      description="Only a person already linked to this vehicle can be selected for a person-owned document."
                      action={(
                        <Button
                          size="small"
                          onClick={() => {
                            if (documentOwnershipTab === "Seller") {
                              setOwnerCreateForVehicleDetails(true);
                              setOwnerCreateOpen(true);
                            } else {
                              setCustomerCreateForVehicleDetails(true);
                              setCustomerCreateOpen(true);
                            }
                          }}
                        >
                          Add person
                        </Button>
                      )}
                    />
                  )}
                </Space>
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="Ownership: Vehicle / 车辆"
                  description="This document category is stored against the vehicle. No seller or buyer selection is required."
                />
              )}
              <div hidden={documentCategory !== "PurchaseInvoice"}>
              <section className="purchaseInvoiceUpload">
                <div className="vehicleContactHeader">
                  <div>
                    <Typography.Text className="moduleEyebrow">Purchase Invoice / 收车发票</Typography.Text>
                    <Typography.Text type="secondary">Enter the invoice manually, or upload a photo and review the extracted values.</Typography.Text>
                  </div>
                  <Button onClick={() => setPurchaseInvoiceCreateOpen(true)}>Enter manually</Button>
                </div>
                <OcrUploadReview
                  vehicleId={selectedVehicleId}
                  category="PurchaseInvoice"
                  disabled={uploadDisabled || !documentOwnershipReady}
                  compact
                  buttonLabel="Upload invoice photo"
                  applyLabel="Use details in purchase invoice"
                  uploadOwner={documentUploadOwner}
                  fields={[
                    { name: "vehicleId", label: "Car Plate", type: "select", options: vehicleOptions },
                    { name: "invoiceNumber", label: "Invoice Number" },
                    { name: "amount", label: "Purchase Amount", type: "number" }
                  ]}
                  onUploaded={() => void loadUploads()}
                  onApply={(values) => {
                    setPurchaseInvoiceOcrDraft(values);
                    setPurchaseInvoiceCreateOpen(true);
                    void loadUploads();
                  }}
                />
                <Table rowKey="id" columns={purchaseInvoiceColumns} dataSource={selectedVehicleInvoices} pagination={tablePagination(5)} scroll={{ x: 560 }} locale={{ emptyText: "No purchase invoice linked to this vehicle yet." }} />
              </section>
              </div>
              <div hidden={documentCategory === "PurchaseInvoice"}>
              <Form.Item label="Document Upload">
                {documentCategory === "IdentityCard" || documentCategory === "Voc" ? (
                  <OcrUploadReview
                    vehicleId={selectedVehicleId}
                    category={documentCategory}
                    disabled={uploadDisabled || !documentOwnershipReady}
                    buttonLabel={documentCategory === "IdentityCard" ? "Add identity card photo" : "Add VOC photo"}
                    applyLabel={documentCategory === "IdentityCard"
                      ? documentOwnershipTab === "Seller" ? "Use details in original owner record" : "Use details in customer record"
                      : "Use details in vehicle record"}
                    uploadOwner={documentUploadOwner}
                    existingValues={documentCategory === "IdentityCard"
                      ? documentOwnershipTab === "Seller"
                        ? selectedVehicleOwner
                          ? { ownerName: selectedVehicleOwner.name, icNumber: selectedVehicleOwner.icNumber, address: selectedVehicleOwner.address }
                          : undefined
                        : selectedVehicleCustomer
                          ? { customerName: selectedVehicleCustomer.name, icNumber: selectedVehicleCustomer.icNumber, address: selectedVehicleCustomer.address }
                          : undefined
                      : documentCategory === "Voc" && selectedVehicle
                        ? { plateNumber: selectedVehicle.plateNumber, chassisNumber: selectedVehicle.chassisNumber, engineNumber: selectedVehicle.engineNumber, make: selectedVehicle.make, model: selectedVehicle.model, year: selectedVehicle.year }
                        : undefined}
                    fields={documentCategory === "IdentityCard"
                      ? [
                        { name: documentOwnershipTab === "Seller" ? "ownerName" : "customerName", label: documentOwnershipTab === "Seller" ? "Original Owner Name" : "Customer Name" },
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
                      : []}
                    onUploaded={() => void loadUploads()}
                    onApply={(values) => {
                      if (documentCategory === "IdentityCard") {
                        if (documentOwnershipTab === "Seller") {
                          if (!selectedVehicleOwner) {
                            message.warning("Link an original owner to this vehicle before applying IC values.");
                            return;
                          }
                          onUpdateOwner({
                            ...selectedVehicleOwner,
                            name: ocrText(values.ownerName, selectedVehicleOwner.name),
                            icNumber: ocrOptionalText(values.icNumber, selectedVehicleOwner.icNumber),
                            address: ocrOptionalText(values.address, selectedVehicleOwner.address)
                          });
                          message.success("Approved IC values were saved to the linked original owner record.");
                        } else {
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
                        }
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
                      }
                      void loadUploads();
                    }}
                  />
                ) : (
                  <Upload
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    disabled={uploadDisabled || !documentOwnershipReady}
                    multiple
                    maxCount={12}
                    showUploadList
                    customRequest={(option) => {
                      void onUploadDocument(selectedVehicleId, option.file as File, documentCategory, documentUploadOwner)
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
              </div>
              </div>
            </Form>
            <div hidden={vehicleAssetTab !== "documents"}>
            <Typography.Text className="moduleEyebrow">{shortformLabel(documentCategory, "Upload history")}</Typography.Text>
            {documentMobileCards}
            <Table className="vehicleDocumentTable desktopDataTable" rowKey="id" columns={documentColumns} dataSource={selectedDocumentHistory} pagination={tablePagination(5)} scroll={{ x: 760 }} locale={{ emptyText: "No documents of this type uploaded yet." }} />
            </div>
          </ProCard>
          </div>
        </Space>
      </Drawer>
      <Modal
        title="Create Vehicle / 新增车辆"
        width={860}
        open={vehicleCreateOpen}
        onCancel={closeVehicleCreate}
        footer={null}
        destroyOnClose
        className="recordCreateModal"
      >
        <StepsForm
          formRef={vehicleCreateFormRef}
          stepsProps={{ responsive: true, size: "small" }}
          submitter={{
            render: ({ step }, dom) => dom.map((button) => {
              if (!isValidElement<{ children?: ReactNode }>(button)) return button;
              const label = button.key === "next"
                ? "Next / 下一步"
                : button.key === "pre"
                  ? "Back / 上一步"
                  : step === 3
                    ? "Create Vehicle / 新增车辆"
                    : button.props.children;
              return cloneElement(button, { children: label });
            })
          }}
          onFinish={async (values) => {
            const vehicle = vehicleFromCreateIntakeValues(values as VehicleIntakeDraft, canApproveVehicles, newId());
            const blockReason = vehicleCreateBlockReason(vehicle, vehicles);
            if (blockReason) {
              message.warning(blockReason);
              return false;
            }

            await onCreate(vehicle);
            closeVehicleCreate();
            return true;
          }}
        >
          <StepsForm.StepForm name="identity" title="Vehicle / 车辆" onFinish={captureVehicleIntakeStep} className="formGrid vehicleIntakeStepForm">
            <Form.Item
              name="plateNumber"
              label="Plate / 车牌"
              normalize={(value: string) => value?.toUpperCase()}
              rules={[
                { required: true, message: "Enter the car plate." },
                { pattern: /^[A-Z0-9]+$/, message: "Use letters and numbers only, with no spaces or symbols." }
              ]}
            >
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item name="chassisNumber" label="Chassis Number"><Input /></Form.Item>
            <Form.Item name="engineNumber" label="Engine Number"><Input /></Form.Item>
            <VehicleMakeModelFields catalogModels={catalogModels} onCreateCatalogModel={addVehicleCatalogModel} />
            <Form.Item
              name="year"
              label="Year"
              rules={[
                { required: true, message: "Enter the vehicle year." },
                { type: "number", min: earliestVehicleYear, max: latestVehicleYear, message: `Enter a year from ${earliestVehicleYear} to ${latestVehicleYear}.` }
              ]}
            >
              <InputNumber className="fullWidth" min={earliestVehicleYear} max={latestVehicleYear} precision={0} step={1} />
            </Form.Item>
          </StepsForm.StepForm>
          <StepsForm.StepForm
            name="stock"
            title="Stock & pricing / 库存与价格"
            onFinish={captureVehicleIntakeStep}
            className="formGrid vehicleIntakeStepForm"
            initialValues={{ contraRangePrice: 0, additionalCharges: 0, refurbishmentTotal: 0, commissionTotal: 0, outstationPickupAllowance: 0 }}
          >
            <Form.Item name="purchasePrice" label="Purchase / 收车价"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="sellingPrice" label="Selling / 售价"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="contraRangePrice" label="Contra Range Price / Contra 价格范围"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="additionalCharges" label="Additional Charges / 杂费"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="refurbishmentTotal" label="Refurbishment Total / 整备预算"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="commissionTotal" label="Commission / 佣金"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="outstationPickupAllowance" label="Outstation Pickup Allowance / 外地收车津贴"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item
              name="outstationPickupScheduledAt"
              label="Outstation Pickup Date & Time / 外地收车时间"
              getValueProps={(value?: string) => ({ value: value ? dayjs(value) : null })}
              normalize={(value: Dayjs | null) => value?.toISOString()}
            >
              <DatePicker className="fullWidth" showTime={{ format: "HH:mm", minuteStep: 5 }} format="DD MMM YYYY, HH:mm" placeholder="Select date and time" />
            </Form.Item>
            <Form.Item name="outstationPickupBookingSlip" label="Booking Slip Reference / 预约单参考编号"><Input placeholder="Booking slip no. or file ref" /></Form.Item>
          </StepsForm.StepForm>
          <StepsForm.StepForm name="publication" title="Buyer & publication / 买家与发布" onFinish={captureVehicleIntakeStep} className="formGrid vehicleIntakeStepForm" initialValues={{ bossConfirmed: false }}>
            <Form.Item name="customerId" label="Customer / 客户">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Select customer"
                options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))}
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <Button
                      type="text"
                      block
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setCustomerCreateForVehicleIntake(true);
                        setCustomerCreateOpen(true);
                      }}
                    >
                      Register new customer
                    </Button>
                  </>
                )}
              />
            </Form.Item>
            <Form.Item name="ownerId" label="Owner / 原车主" rules={[{ required: true, message: "Select or register the original owner before completing intake." }]}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Select owner"
                options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))}
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <Button
                      type="text"
                      block
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setOwnerCreateForVehicleIntake(true);
                        setOwnerCreateOpen(true);
                      }}
                    >
                      Register new owner
                    </Button>
                  </>
                )}
              />
            </Form.Item>
            <Form.Item className="vehicleMarkdownField" name="publicDescriptionMarkdown" label="Public Listing Description (Markdown)" extra="Optional public copy. Raw HTML is displayed as text.">
              <MDEditor preview="edit" height={220} visibleDragbar={false} textareaProps={{ maxLength: 6000, placeholder: "## Ready stock\n\n- Key feature\n- Viewing by appointment" }} />
            </Form.Item>
            <div className="vehicleMarkdownPreviewField">
              <Form.Item noStyle shouldUpdate={(previous, current) => previous.publicDescriptionMarkdown !== current.publicDescriptionMarkdown}>
                {({ getFieldValue }) => <MarketingDescription markdown={getFieldValue("publicDescriptionMarkdown")} className="backofficeMarketingPreview" />}
              </Form.Item>
            </div>
          </StepsForm.StepForm>
          <StepsForm.StepForm name="review" title="Review / 核对">
            <VehicleIntakeReview draft={vehicleIntakeDraft} customers={customers} owners={owners} />
          </StepsForm.StepForm>
        </StepsForm>
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
          <Form.Item name="amount" label="Purchase Amount"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
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
          <Form.Item name="amount" label="Purchase Amount"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
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
        onCancel={() => {
          setCustomerCreateOpen(false);
          setCustomerCreateForLoanVehicleId("");
          setCustomerCreateForVehicleIntake(false);
          setCustomerCreateForVehicleDetails(false);
        }}
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
            const vehicleIntake = customerCreateForVehicleIntake;
            const vehicleDetails = customerCreateForVehicleDetails;
            setCustomerCreateForLoanVehicleId("");
            setCustomerCreateForVehicleIntake(false);
            setCustomerCreateForVehicleDetails(false);
            setCustomerCreateOpen(false);
            if (vehicleIntake) {
              vehicleCreateFormRef.current?.setFieldValue("customerId", customer.id);
            }
            if (loanVehicleId) {
              selectVehicle(loanVehicleId);
              setLoanHandoffCustomerId(customer.id);
              setLoanHandoffVehicleId(loanVehicleId);
            }
            if (vehicleDetails && selectedVehicle) {
              await onUpdate({ ...selectedVehicle, customerId: customer.id });
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
        onCancel={() => {
          setOwnerCreateOpen(false);
          setOwnerCreateForVehicleIntake(false);
          setOwnerCreateForVehicleDetails(false);
        }}
        footer={null}
        destroyOnClose
        className="recordCreateModal"
      >
        <Form layout="vertical" className="modalForm" onFinish={async (values) => {
          const owner: Owner = {
            id: newId(),
            name: values.name,
            phone: values.phone,
            icNumber: values.icNumber,
            address: values.address
          };
          const blockReason = ownerCreateBlockReason(owner, owners);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }

          await onCreateOwner(owner);
          const vehicleIntake = ownerCreateForVehicleIntake;
          const vehicleDetails = ownerCreateForVehicleDetails;
          setOwnerCreateForVehicleIntake(false);
          setOwnerCreateForVehicleDetails(false);
          setOwnerCreateOpen(false);
          if (vehicleIntake) {
            vehicleCreateFormRef.current?.setFieldValue("ownerId", owner.id);
          }
          if (vehicleDetails && selectedVehicle) {
            await onUpdate({ ...selectedVehicle, ownerId: owner.id });
          }
        }}>
          <Form.Item name="name" label="Owner Name / 原车主姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="icNumber" label={shortformLabel("IC / 身份证", "Identity card number")}><Input /></Form.Item>
          <Form.Item name="address" label="Address / 地址"><Input placeholder="Original owner address" /></Form.Item>
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
              phone: values.phone,
              icNumber: values.icNumber,
              address: values.address
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
          <Form.Item name="icNumber" label={shortformLabel("IC / 身份证", "Identity card number")}><Input /></Form.Item>
          <Form.Item name="address" label="Address / 地址"><Input placeholder="Original owner address" /></Form.Item>
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

function formatDocumentTimestamp(value: unknown) {
  const parsed = dayjs(String(value));
  return parsed.isValid() ? parsed.format("DD MMM YYYY, HH:mm") : "-";
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

function documentOwnershipLabel(document: Pick<VehicleDocument, "ownershipType" | "customerId" | "ownerId"> | Pick<VehicleOcrJob["document"], "ownershipType" | "customerId" | "ownerId">, customers: Customer[], owners: Owner[]) {
  if (document.ownershipType === "Seller") return `Seller / Original owner: ${contactFor(owners, document.ownerId)}`;
  if (document.ownershipType === "Buyer") return `Buyer / Customer: ${contactFor(customers, document.customerId)}`;
  return "Vehicle / 车辆";
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

export function effectiveRepairCost(vehicle: Pick<Vehicle, "id" | "refurbishmentTotal" | "repairCost">, repairs: RepairJob[]) {
  if (vehicle.repairCost !== undefined) return vehicle.repairCost;
  const finalRepairs = repairs.filter((repair) => repair.vehicleId === vehicle.id && isRepairCostFinal(repair));
  return finalRepairs.length > 0
    ? finalRepairs.reduce((total, repair) => total + repair.cost, 0)
    : vehicle.refurbishmentTotal;
}

export function effectiveCommissionCost(vehicle: Pick<Vehicle, "id" | "commissionTotal">, brokerCommissions: BrokerCommission[]) {
  const vehicleCommissions = brokerCommissions.filter((commission) => commission.vehicleId === vehicle.id);
  return vehicleCommissions.length > 0
    ? vehicleCommissions.reduce((total, commission) => total + commission.amount, 0)
    : vehicle.commissionTotal;
}

export function effectivePickupAllowanceCost(vehicle: Pick<Vehicle, "id" | "outstationPickupAllowance">, paymentVouchers: PaymentVoucher[]) {
  const vehicleVouchers = paymentVouchers.filter((voucher) => voucher.vehicleId === vehicle.id);
  return vehicleVouchers.length > 0
    ? vehicleVouchers.reduce((total, voucher) => total + voucher.amount, 0)
    : vehicle.outstationPickupAllowance ?? 0;
}

export function estimatedVehicleProfit(
  vehicle: Vehicle,
  repairCost = vehicle.refurbishmentTotal,
  commissionCost = vehicle.commissionTotal,
  pickupAllowanceCost = vehicle.outstationPickupAllowance ?? 0
) {
  return vehicle.sellingPrice + vehicle.additionalCharges - vehicle.purchasePrice - repairCost - commissionCost - pickupAllowanceCost;
}

export function vehicleSoldInAnalyticsPeriod(vehicle: Vehicle, period?: DashboardAnalyticsPeriod) {
  if (!period?.from || !period.to) return true;
  if (!vehicle.soldAt) return false;
  const soldDate = singaporeTodayIsoDate(new Date(vehicle.soldAt));
  return soldDate >= period.from && soldDate <= period.to;
}

export function filterVehiclesForDashboardFocus(
  vehicles: Vehicle[],
  dashboardFocus?: DashboardVehicleFocus,
  dashboardAnalyticsPeriod?: DashboardAnalyticsPeriod,
  todayIsoDate = singaporeTodayIsoDate()
) {
  if (dashboardFocus === "stock" || dashboardFocus === "profit") return vehicles.filter((vehicle) => vehicle.status !== "Sold");
  if (dashboardFocus === "sold") return vehicles.filter((vehicle) => vehicle.status === "Sold" && vehicleSoldInAnalyticsPeriod(vehicle, dashboardAnalyticsPeriod));
  if (dashboardFocus === "fresh") return vehicles.filter((vehicle) => vehicle.status !== "Sold" && vehicleAgeInDays(vehicle, todayIsoDate) <= 30);
  if (dashboardFocus === "watch") return vehicles.filter((vehicle) => vehicle.status !== "Sold" && vehicleAgeInDays(vehicle, todayIsoDate) > 30 && vehicleAgeInDays(vehicle, todayIsoDate) <= 60);
  if (dashboardFocus === "aging") return vehicles.filter((vehicle) => vehicle.status !== "Sold" && vehicleAgeInDays(vehicle, todayIsoDate) > 60);
  return vehicles;
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
