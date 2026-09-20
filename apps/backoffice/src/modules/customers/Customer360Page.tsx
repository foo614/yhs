import { useEffect, useMemo, useState } from "react";
import { FileImageOutlined, FileTextOutlined, WarningOutlined } from "@ant-design/icons";
import { ProCard } from "@ant-design/pro-components";
import { Alert, Button, Collapse, Descriptions, Empty, Image, Input, Select, Space, Spin, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { OperationsProTable } from "../shared/OperationsProTable";
import { DocumentPreviewButton } from "../shared/DocumentPreviewButton";
import {
  getProtectedFileContent,
  financeInvoiceContentUrl,
  getCustomerProfile,
  getCustomerProfileOptions,
  humanizeApiError,
  officialReceiptContentUrl,
  vehicleDocumentContentUrl,
  type CustomerProfile,
  type CustomerProfileOption,
  type CustomerProfileDelivery,
  type CustomerProfileDocument,
  type CustomerProfileEnquiry,
  type CustomerProfileInvoice,
  type CustomerProfileLoan,
  type CustomerProfileMissingDocument,
  type CustomerProfilePayment,
  type CustomerProfileReceipt,
  type CustomerProfileVehicle
} from "../../api";
import "./Customer360Page.css";

export type Customer360SourcePath = "/vehicles" | "/loans" | "/delivery" | "/finance" | "/leads";

export function customerProfileOptionLabel(option: CustomerProfileOption) {
  return `${option.name} · ${option.phone?.trim() || "No phone recorded"}`;
}

type CustomerProfileSelectOption = {
  value: string;
  label: string;
  name: string;
  id: string;
  phone?: string | null;
};

export function canShowCustomer360SourceLink(
  path: Customer360SourcePath,
  canAccessPath: (path: Customer360SourcePath) => boolean
) {
  return canAccessPath(path);
}

export type Customer360SourceTarget = {
  path: string;
  label: string;
};

/** Returns only deep links supported by the existing module route contracts. */
export function customer360SourceTarget(path: Customer360SourcePath, recordId?: string, fallbackLabel = "Open module"): Customer360SourceTarget {
  if (path === "/loans" && recordId) {
    return { path: `/loans?loanId=${encodeURIComponent(recordId)}`, label: "Open loan" };
  }
  if (path === "/delivery" && recordId) {
    return { path: `/delivery?deliveryId=${encodeURIComponent(recordId)}`, label: "Open delivery" };
  }
  return { path, label: `Open ${fallbackLabel}` };
}

const documentLabels: Record<CustomerProfileDocument["category"], string> = {
  PurchaseInvoice: "Purchase Invoice",
  Voc: "VOC",
  IdentityCard: "Identity Card",
  ApDocument: "AP Document",
  StatusReceipt: "Status Receipt",
  LoanDocument: "Loan Document",
  DeliveryDocument: "Delivery Document",
  HandoverPhoto: "Handover Photo",
  SignedHandover: "Signed Handover",
  Policy: "Policy",
  RoadTaxReceipt: "Road Tax Receipt",
  RepairInvoice: "Repair Invoice",
  PaymentReceipt: "Payment Receipt",
  PaymentInvoice: "Payment Invoice",
  MedicalCertificate: "Medical Certificate",
  InspectionReport: "Inspection Report",
  WindscreenPolicy: "Windscreen Policy"
};

function displayValue(value?: string | number | null) {
  return value === undefined || value === null || value === "" ? "—" : value;
}

function money(value: number) {
  return `RM ${new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

function upperCaseMeridiem(value: string) {
  return value.replace(/\b(am|pm)\b/g, (part) => part.toUpperCase());
}

/** Formats API timestamps for staff in Malaysia/Singapore time while leaving date-only values unshifted. */
export function formatCustomer360Date(value?: string | null) {
  if (!value) return "—";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(isDateOnly ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(parsed.getTime())) return value;

  const formatted = new Intl.DateTimeFormat("en-MY", isDateOnly
    ? { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }
    : { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Singapore" }
  ).format(parsed);
  return upperCaseMeridiem(formatted);
}

type MissingDocumentGroup = {
  vehicleId?: string;
  items: Array<{ category: CustomerProfileMissingDocument["category"]; messages: string[] }>;
};

/** Deduplicates repeated requirements by vehicle/category while retaining every backend message for detail view. */
export function groupMissingDocuments(items: readonly CustomerProfileMissingDocument[]): MissingDocumentGroup[] {
  const byVehicle = new Map<string, { vehicleId?: string; byCategory: Map<CustomerProfileMissingDocument["category"], string[]> }>();
  for (const item of items) {
    const vehicleKey = item.vehicleId ?? "unlinked";
    let vehicleGroup = byVehicle.get(vehicleKey);
    if (!vehicleGroup) {
      vehicleGroup = { vehicleId: item.vehicleId, byCategory: new Map() };
      byVehicle.set(vehicleKey, vehicleGroup);
    }
    const messages = vehicleGroup.byCategory.get(item.category) ?? [];
    if (item.message && !messages.includes(item.message)) messages.push(item.message);
    vehicleGroup.byCategory.set(item.category, messages);
  }

  return [...byVehicle.values()].map((group) => ({
    vehicleId: group.vehicleId,
    items: [...group.byCategory.entries()].map(([category, messages]) => ({ category, messages }))
  }));
}

function vehicleDescription(vehicle: CustomerProfileVehicle) {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim();
}

function vehicleReference(vehicleId: string | undefined, vehicles: readonly CustomerProfileVehicle[]) {
  const vehicle = vehicleId ? vehicles.find((item) => item.id === vehicleId) : undefined;
  if (!vehicle) {
    return (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{vehicleId ? `Vehicle ${vehicleId.slice(0, 8)}` : "Unlinked record"}</Typography.Text>
        <Typography.Text type="secondary">No linked vehicle details</Typography.Text>
      </Space>
    );
  }
  return (
    <Space direction="vertical" size={0}>
      <Typography.Text strong>{vehicle.plateNumber || "Plate unavailable"}</Typography.Text>
      <Typography.Text type="secondary">{vehicleDescription(vehicle)}</Typography.Text>
    </Space>
  );
}

function ProfileTable<RecordType extends object>({
  columns,
  dataSource,
  pagination = false,
  rowKey
}: {
  columns: ColumnsType<RecordType>;
  dataSource: RecordType[];
  pagination?: false | TablePaginationConfig;
  rowKey?: string | ((record: RecordType) => string);
}) {
  return dataSource.length > 0 ? (
    <OperationsProTable<RecordType>
      columns={columns}
      dataSource={dataSource}
      pagination={pagination}
      className="customer360ProfileTable"
      rowKey={rowKey ?? ((record) => (record as { id?: string }).id ?? JSON.stringify(record))}
      scroll={{ x: "max-content" }}
      search={false}
      size="small"
    />
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No linked records yet." />;
}

function isPreviewableImage(mimeType: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(mimeType.split(";", 1)[0].trim().toLowerCase());
}

function ProtectedImageThumbnail({ document }: { document: CustomerProfileDocument }) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState(false);
  const downloadUrl = vehicleDocumentContentUrl(document.vehicleId, document.id);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSrc("");
    setError(false);

    if (!isPreviewableImage(document.mimeType)) return () => { active = false; };

    void getProtectedFileContent(downloadUrl, "Unable to load image thumbnail")
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document.id, document.mimeType, downloadUrl]);

  if (!isPreviewableImage(document.mimeType)) {
    return <span className="customer360DocumentThumbnail customer360DocumentThumbnailPlaceholder" aria-label="File preview unavailable"><FileTextOutlined /></span>;
  }
  if (error) {
    return <Tooltip title="Image thumbnail unavailable"><span className="customer360DocumentThumbnail customer360DocumentThumbnailPlaceholder" aria-label="Image thumbnail unavailable"><FileImageOutlined /></span></Tooltip>;
  }
  if (!src) {
    return <span className="customer360DocumentThumbnail customer360DocumentThumbnailPlaceholder" aria-label="Loading image thumbnail"><Spin size="small" /></span>;
  }
  return <Image className="customer360DocumentThumbnail" width={48} height={48} src={src} preview={{ src }} alt={`Preview of ${document.fileName}`} />;
}

function AuthorizedUploadsTable({
  customerId,
  documents,
  vehicles,
  selectedVehicleId
}: {
  customerId: string;
  documents: CustomerProfileDocument[];
  vehicles: CustomerProfileVehicle[];
  selectedVehicleId: string;
}) {
  const [fileNameQuery, setFileNameQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const vehicleIds = useMemo(() => new Set(vehicles.map((vehicle) => vehicle.id)), [vehicles]);

  const matchesVehicle = (vehicleId: string) => {
    if (selectedVehicleId === "all") return true;
    if (selectedVehicleId === "unlinked") return !vehicleIds.has(vehicleId);
    return selectedVehicleId === vehicleId;
  };

  useEffect(() => {
    setFileNameQuery("");
    setCategory("");
    setPage(1);
    setPageSize(10);
  }, [customerId]);

  useEffect(() => {
    setPage(1);
  }, [selectedVehicleId, fileNameQuery, category]);

  const filteredDocuments = useMemo(() => documents
    .filter((document) => matchesVehicle(document.vehicleId))
    .filter((document) => !category || document.category === category)
    .filter((document) => !fileNameQuery.trim() || document.fileName.toLocaleLowerCase().includes(fileNameQuery.trim().toLocaleLowerCase()))
    .sort((left, right) => Date.parse(right.uploadedAt) - Date.parse(left.uploadedAt)),
  [category, documents, fileNameQuery, selectedVehicleId, vehicleIds]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredDocuments.length / pageSize));
    setPage((current) => Math.min(current, maxPage));
  }, [filteredDocuments.length, pageSize]);

  const columns: ColumnsType<CustomerProfileDocument> = [
    { title: "Preview", key: "preview", width: 72, render: (_, document) => <ProtectedImageThumbnail document={document} /> },
    { title: "Category", dataIndex: "category", render: (value: CustomerProfileDocument["category"]) => documentLabels[value] ?? value },
    {
      title: "File",
      dataIndex: "fileName",
      render: (fileName: string, document) => (
        <Space direction="vertical" size={0}>
          <Typography.Text ellipsis={{ tooltip: fileName }}>{fileName}</Typography.Text>
          <div>{vehicleReference(document.vehicleId, vehicles)}</div>
        </Space>
      )
    },
    { title: "Uploaded", render: (_, document) => `${formatCustomer360Date(document.uploadedAt)} · ${document.uploadedBy || "System"}` },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 190,
      render: (_: unknown, document: CustomerProfileDocument) => {
        const downloadUrl = vehicleDocumentContentUrl(document.vehicleId, document.id);
        return <DocumentPreviewButton
          fileName={document.fileName}
          mimeType={document.mimeType}
          downloadUrl={downloadUrl}
          loadContent={() => getProtectedFileContent(downloadUrl, "Unable to load document preview")}
          previewLabel="Preview"
          downloadLabel="Download"
        />;
      }
    }
  ];

  return (
    <>
      <Space wrap className="customer360DocumentFilters" size={8}>
        <Input
          allowClear
          aria-label="Search authorized uploads by filename"
          placeholder="Search filename"
          value={fileNameQuery}
          onChange={(event) => setFileNameQuery(event.target.value)}
        />
        <Select
          allowClear
          aria-label="Filter authorized uploads by category"
          className="customer360DocumentCategoryFilter"
          placeholder="All categories"
          showSearch
          optionFilterProp="label"
          value={category || undefined}
          options={Object.entries(documentLabels).map(([value, label]) => ({ value, label }))}
          onChange={(value) => setCategory(value ?? "")}
        />
      </Space>
      <div aria-label="Authorized uploads table">
        <ProfileTable
          columns={columns}
          dataSource={filteredDocuments}
          rowKey="id"
          pagination={{
            current: page,
            pageSize,
            total: filteredDocuments.length,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total) => `${total} file${total === 1 ? "" : "s"}`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            }
          }}
        />
      </div>
    </>
  );
}

function MissingDocumentsSummary({
  groups,
  vehicles
}: {
  groups: MissingDocumentGroup[];
  vehicles: CustomerProfileVehicle[];
}) {
  if (groups.length === 0) return null;
  const count = groups.reduce((total, group) => total + group.items.length, 0);
  return (
    <Collapse
      className="customer360MissingDocuments"
      size="small"
      items={[{
        key: "missing-documents",
        label: <Space><WarningOutlined /> <span>Missing linked documents / 缺少关联文件</span> <Tag color="orange">{count}</Tag></Space>,
        children: (
          <Space direction="vertical" size={12} className="fullWidth">
            {groups.map((group) => (
              <div key={group.vehicleId ?? "unlinked"} className="customer360MissingGroup">
                <div>{group.vehicleId ? vehicleReference(group.vehicleId, vehicles) : <Typography.Text strong>Unlinked records</Typography.Text>}</div>
                <Space direction="vertical" size={4} className="fullWidth">
                  {group.items.map((item) => (
                    <div key={item.category}>
                      <Tag color="orange">{documentLabels[item.category] ?? item.category}</Tag>
                      <Space direction="vertical" size={2}>
                        {item.messages.map((message) => <Typography.Text type="secondary" key={message}>{message}</Typography.Text>)}
                      </Space>
                    </div>
                  ))}
                </Space>
              </div>
            ))}
          </Space>
        )
      }]}
    />
  );
}

export function Customer360Page({
  customerId,
  onCustomerChange,
  onNavigate,
  canAccessPath
}: {
  customerId?: string;
  onCustomerChange: (id: string) => void;
  onNavigate: (path: string) => void;
  canAccessPath: (path: Customer360SourcePath) => boolean;
}) {
  const [options, setOptions] = useState<CustomerProfileOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId ?? "");
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState("all");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [optionsRequestVersion, setOptionsRequestVersion] = useState(0);
  const customerSelectOptions: CustomerProfileSelectOption[] = options.map((option) => ({
    value: option.id,
    label: customerProfileOptionLabel(option),
    name: option.name,
    id: option.id,
    phone: option.phone
  }));

  useEffect(() => {
    setSelectedCustomerId(customerId ?? "");
  }, [customerId]);

  useEffect(() => {
    let active = true;
    setLoadingOptions(true);
    setOptionsError(null);
    void getCustomerProfileOptions()
      .then((result) => {
        if (!active) return;
        setOptions(result);
        setSelectedCustomerId((current) => current && result.some((option) => option.id === current) ? current : result[0]?.id ?? "");
      })
      .catch((reason: unknown) => {
        if (active) setOptionsError(humanizeApiError(reason, "Customer profile options could not be loaded."));
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });

    return () => {
      active = false;
    };
  }, [optionsRequestVersion]);

  useEffect(() => {
    setSelectedVehicleId("all");
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setProfile(null);
      return;
    }

    let active = true;
    setProfile(null);
    setLoadingProfile(true);
    setProfileError(null);
    void getCustomerProfile(selectedCustomerId)
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch((reason: unknown) => {
        if (active) {
          setProfile(null);
          setProfileError(humanizeApiError(reason, "Customer profile could not be loaded."));
        }
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCustomerId]);

  const sourceColumn = <RecordType extends object>(path: Customer360SourcePath, label: string, getRecordId?: (record: RecordType) => string | undefined) => canShowCustomer360SourceLink(path, canAccessPath)
    ? [{ title: "Action / 操作", key: "source", fixed: "right", width: 140, render: (_: unknown, record: RecordType) => {
      const target = customer360SourceTarget(path, getRecordId?.(record), label);
      return <Button type="link" size="small" onClick={() => onNavigate(target.path)}>{target.label}</Button>;
    } } satisfies ColumnsType<RecordType>[number]]
    : [];

  const vehicleById = useMemo(() => new Map((profile?.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle])), [profile?.vehicles]);
  const paymentVehicleById = useMemo(() => new Map((profile?.payments ?? []).map((payment) => [payment.id, payment.vehicleId])), [profile?.payments]);
  const matchesVehicle = (vehicleId?: string) => {
    if (selectedVehicleId === "all") return true;
    if (selectedVehicleId === "unlinked") return !vehicleId || !vehicleById.has(vehicleId);
    return selectedVehicleId === vehicleId;
  };

  const vehicleColumns: ColumnsType<CustomerProfileVehicle> = [
    { title: "Vehicle / 车辆", render: (_, vehicle) => vehicleReference(vehicle.id, [vehicle]) },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Sold" ? "purple" : status === "Available" ? "green" : "blue"}>{status}</Tag> },
    ...sourceColumn<CustomerProfileVehicle>("/vehicles", "Vehicles")
  ];
  const loanColumns: ColumnsType<CustomerProfileLoan> = [
    { title: "Vehicle", render: (_, loan) => vehicleReference(loan.vehicleId, profile?.vehicles ?? []) },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Approved" || status === "Done" ? "green" : "blue"}>{status}</Tag> },
    { title: "Submitted", render: (_, loan) => formatCustomer360Date(loan.submittedAt) },
    { title: "LOU", render: (_, loan) => <Space direction="vertical" size={0}><span>{loan.louApproved ? "LOU approval: Approved" : "LOU approval: Pending"}</span><Typography.Text type="secondary">{loan.louDone ? "LOU completion: Done" : "LOU completion: Pending"}</Typography.Text></Space> },
    ...sourceColumn<CustomerProfileLoan>("/loans", "Loan", (loan) => loan.id)
  ];
  const deliveryColumns: ColumnsType<CustomerProfileDelivery> = [
    { title: "Vehicle", render: (_, delivery) => vehicleReference(delivery.vehicleId, profile?.vehicles ?? []) },
    { title: "Schedule / 交车", render: (_, delivery) => `${formatCustomer360Date(delivery.scheduledDate)} · ${delivery.status}` },
    { title: "PIC", dataIndex: "pic", render: displayValue },
    { title: "Coverage", render: (_, delivery) => `${delivery.insuranceHandled ? "Insurance" : "Insurance missing"}; ${delivery.roadTaxHandled ? "Road tax" : "Road tax missing"}; ${delivery.windscreenInsuranceHandled ? "Windscreen" : "Windscreen missing"}` },
    ...sourceColumn<CustomerProfileDelivery>("/delivery", "Delivery", (delivery) => delivery.id)
  ];
  const paymentColumns: ColumnsType<CustomerProfilePayment> = [
    { title: "Vehicle", render: (_, payment) => vehicleReference(payment.vehicleId, profile?.vehicles ?? []) },
    { title: "Payment", render: (_, payment) => <><Tag color={payment.status === "Reconciled" ? "green" : "blue"}>{payment.status}</Tag> {money(payment.nettPrice)}</> },
    { title: "Receipt / Invoice", render: (_, payment) => `${displayValue(payment.receiptNumber)} / ${displayValue(payment.invoiceNumber)}` },
    { title: "Created", render: (_, payment) => formatCustomer360Date(payment.createdAt) },
    ...sourceColumn<CustomerProfilePayment>("/finance", "Finance", (payment) => payment.id)
  ];
  const invoiceColumns: ColumnsType<CustomerProfileInvoice> = [
    { title: "Vehicle", render: (_, invoice) => vehicleReference(invoice.vehicleId, profile?.vehicles ?? []) },
    { title: "Invoice", dataIndex: "invoiceNumber" },
    { title: "Date", render: (_, invoice) => formatCustomer360Date(invoice.invoiceDate) },
    { title: "Amount", dataIndex: "amount", render: money },
    {
      title: "File",
      render: (_, invoice) => {
        const downloadUrl = financeInvoiceContentUrl(invoice.id);
        return <DocumentPreviewButton
          fileName={`${invoice.invoiceNumber}.pdf`}
          mimeType="application/pdf"
          downloadUrl={downloadUrl}
          loadContent={() => getProtectedFileContent(downloadUrl, "Unable to load invoice preview")}
          previewLabel="Preview PDF"
          downloadLabel="Download PDF"
        />;
      }
    },
    ...sourceColumn<CustomerProfileInvoice>("/finance", "Finance", (invoice) => invoice.paymentRecordId)
  ];
  const receiptColumns: ColumnsType<CustomerProfileReceipt> = [
    { title: "Vehicle", render: (_, receipt) => vehicleReference(paymentVehicleById.get(receipt.paymentRecordId), profile?.vehicles ?? []) },
    { title: "Receipt", dataIndex: "receiptNumber" },
    { title: "Amount", dataIndex: "amount", render: money },
    { title: "Issued", render: (_, receipt) => formatCustomer360Date(receipt.createdAt) },
    {
      title: "File",
      render: (_, receipt) => {
        const downloadUrl = officialReceiptContentUrl(receipt.cashHandoverId);
        return <DocumentPreviewButton
          fileName={`${receipt.receiptNumber}.pdf`}
          mimeType="application/pdf"
          downloadUrl={downloadUrl}
          loadContent={() => getProtectedFileContent(downloadUrl, "Unable to load receipt preview")}
          previewLabel="Preview PDF"
          downloadLabel="Download PDF"
        />;
      }
    },
    ...sourceColumn<CustomerProfileReceipt>("/finance", "Finance", (receipt) => receipt.paymentRecordId)
  ];
  const enquiryColumns: ColumnsType<CustomerProfileEnquiry> = [
    { title: "Vehicle", render: (_, enquiry) => vehicleReference(enquiry.vehicleId, profile?.vehicles ?? []) },
    { title: "Status", dataIndex: "status", render: (status) => <Tag color={status === "Closed" ? "default" : status === "Contacted" ? "blue" : "orange"}>{status}</Tag> },
    { title: "Message", dataIndex: "message", render: displayValue },
    { title: "Source", dataIndex: "sourcePage", render: displayValue },
    { title: "Received", render: (_, enquiry) => formatCustomer360Date(enquiry.createdAt) },
    ...sourceColumn<CustomerProfileEnquiry>("/leads", "Leads")
  ];
  const missingDocumentGroups = profile
    ? groupMissingDocuments(profile.missingDocuments.filter((item) => matchesVehicle(item.vehicleId)))
    : [];

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard title="Customer 360 / 客户全景">
        <div className="customer360CustomerPicker">
          <label className="customer360CustomerPickerLabel" htmlFor="customer360-customer-select">Customer profile / 客户档案</label>
          <Select
            id="customer360-customer-select"
            aria-label="Customer profile"
            className="customerProfileSelect"
            loading={loadingOptions}
            notFoundContent={loadingOptions ? <Spin size="small" /> : optionsError ? "Customer options unavailable" : "No customer records"}
            options={customerSelectOptions}
            optionRender={(option) => {
              const customer = option.data as CustomerProfileSelectOption;
              return (
                <div className="customerProfileOption" title={customer.name}>
                  <Typography.Text strong className="customerProfileOptionName">{customer.name}</Typography.Text>
                  <Typography.Text type="secondary" className="customerProfileOptionId">{customer.phone?.trim() || "No phone recorded"}</Typography.Text>
                </div>
              );
            }}
            labelRender={(selected) => {
              const selectedLabel = typeof selected.label === "string" ? selected.label : "Selected customer";
              return <Tooltip title={selectedLabel}><span className="customerProfileSelectedLabel">{selectedLabel}</span></Tooltip>;
            }}
            placeholder="Search customer name or phone"
            popupClassName="customerProfileDropdown"
            popupMatchSelectWidth
            showSearch
            virtual={false}
            optionFilterProp="label"
            value={selectedCustomerId || undefined}
            onChange={(value) => {
              setProfile(null);
              setProfileError(null);
              setSelectedCustomerId(value);
              onCustomerChange(value);
            }}
          />
        </div>
        <Alert className="operationalInfoAlert" showIcon type="info" message="Live source records are shown only where your role already has access; this view does not copy or merge customer data." />
      </ProCard>

      {optionsError ? <Alert className="operationalInfoAlert" type="error" showIcon message="Customer selector unavailable" description={optionsError} action={<Button size="small" onClick={() => setOptionsRequestVersion((version) => version + 1)}>Try again</Button>} /> : null}
      {profileError ? <Alert className="operationalInfoAlert" type="error" showIcon message="Customer profile unavailable" description={profileError} /> : null}
      {loadingProfile ? <ProCard><Spin /></ProCard> : null}
      {!loadingProfile && !profile && !profileError ? <ProCard><Empty description="Select a customer to view linked history." /></ProCard> : null}
      {profile ? (
        <>
          <ProCard title="Customer summary / 客户摘要">
            <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
              <Descriptions.Item label="Customer ID">{profile.contact.id}</Descriptions.Item>
              <Descriptions.Item label="Name">{profile.contact.name}</Descriptions.Item>
              {profile.contact.phone ? <Descriptions.Item label="Phone">{profile.contact.phone}</Descriptions.Item> : null}
              {profile.permissions.canViewIdentity ? <>
                <Descriptions.Item label="IC Number">{displayValue(profile.contact.icNumber)}</Descriptions.Item>
                <Descriptions.Item label="TIN">{displayValue(profile.contact.tinNumber)}</Descriptions.Item>
                <Descriptions.Item label="Email">{displayValue(profile.contact.email)}</Descriptions.Item>
                <Descriptions.Item label="Address">{displayValue(profile.contact.address)}</Descriptions.Item>
                <Descriptions.Item label="Notes">{displayValue(profile.contact.notes)}</Descriptions.Item>
              </> : <Descriptions.Item><Typography.Text type="secondary">Some contact fields are hidden for your role.</Typography.Text></Descriptions.Item>}
            </Descriptions>
            <Space wrap className="customer360ActiveSummary" size={[8, 8]}>
              {profile.permissions.canViewLoans ? <Tag color="blue">Loans in progress / 进行中: {profile.loans.filter((loan) => !["Done", "Rejected"].includes(loan.status) && matchesVehicle(loan.vehicleId)).length}</Tag> : null}
              {profile.permissions.canViewDelivery ? <Tag color="blue">Deliveries in progress / 交车进行中: {profile.deliveries.filter((delivery) => !["Released", "Cancelled"].includes(delivery.status) && matchesVehicle(delivery.vehicleId)).length}</Tag> : null}
            </Space>
            <Space wrap className="customer360SectionNav" size={[4, 4]}>
              {[
                { id: "customer360-vehicles", label: "Vehicles", count: profile.vehicles.filter((vehicle) => matchesVehicle(vehicle.id)).length, visible: true },
                { id: "customer360-loans", label: "Loans", count: profile.loans.filter((loan) => matchesVehicle(loan.vehicleId)).length, visible: profile.permissions.canViewLoans },
                { id: "customer360-delivery", label: "Delivery", count: profile.deliveries.filter((delivery) => matchesVehicle(delivery.vehicleId)).length, visible: profile.permissions.canViewDelivery },
                { id: "customer360-finance", label: "Finance", count: profile.payments.filter((payment) => matchesVehicle(payment.vehicleId)).length, visible: profile.permissions.canViewFinance },
                { id: "customer360-documents", label: "Documents", count: profile.documents.filter((document) => matchesVehicle(document.vehicleId)).length, visible: profile.permissions.canViewDocuments },
                { id: "customer360-enquiries", label: "Enquiries", count: profile.enquiries.filter((enquiry) => matchesVehicle(enquiry.vehicleId)).length, visible: profile.permissions.canViewEnquiries },
                { id: "customer360-missing", label: "Missing documents", count: missingDocumentGroups.reduce((total, group) => total + group.items.length, 0), visible: missingDocumentGroups.length > 0 }
              ].filter((section) => section.visible).map((section) => (
                <Button key={section.id} type="link" size="small" onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  {section.label} ({section.count})
                </Button>
              ))}
            </Space>
            <Space wrap className="customer360VehicleFilter" size={8}>
              <Typography.Text strong>View records by vehicle / 按车辆查看</Typography.Text>
              <Select
                aria-label="Filter Customer 360 records by vehicle"
                className="customer360VehicleSelect"
                value={selectedVehicleId}
                options={[
                  { value: "all", label: `All vehicles (${profile.vehicles.length})` },
                  ...profile.vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plateNumber} · ${vehicleDescription(vehicle)}` })),
                  { value: "unlinked", label: "Unlinked records" }
                ]}
                showSearch
                optionFilterProp="label"
                onChange={setSelectedVehicleId}
              />
            </Space>
          </ProCard>

          <div id="customer360-vehicles"><ProCard title="Vehicles and purchase history / 车辆与购车历史"><ProfileTable columns={vehicleColumns} dataSource={profile.vehicles.filter((vehicle) => matchesVehicle(vehicle.id))} /></ProCard></div>

          {profile.permissions.canViewLoans ? <div id="customer360-loans"><ProCard title="Loans / 贷款"><ProfileTable columns={loanColumns} dataSource={profile.loans.filter((loan) => matchesVehicle(loan.vehicleId))} /></ProCard></div> : null}
          {profile.permissions.canViewDelivery ? <div id="customer360-delivery"><ProCard title="Delivery and coverage / 交车与保障"><ProfileTable columns={deliveryColumns} dataSource={profile.deliveries.filter((delivery) => matchesVehicle(delivery.vehicleId))} /></ProCard></div> : null}
          {profile.permissions.canViewFinance ? <div id="customer360-finance"><ProCard title="Payments, invoices, and receipts / 收款、发票与收据">
            <Typography.Title level={5}>Payments</Typography.Title>
            <ProfileTable columns={paymentColumns} dataSource={profile.payments.filter((payment) => matchesVehicle(payment.vehicleId))} />
            <Typography.Title level={5}>Invoices</Typography.Title>
            <ProfileTable columns={invoiceColumns} dataSource={profile.invoices.filter((invoice) => matchesVehicle(invoice.vehicleId))} />
            <Typography.Title level={5}>Official receipts</Typography.Title>
            <ProfileTable columns={receiptColumns} dataSource={profile.officialReceipts.filter((receipt) => matchesVehicle(paymentVehicleById.get(receipt.paymentRecordId)))} />
          </ProCard></div> : null}
          {profile.permissions.canViewDocuments ? <div id="customer360-documents"><ProCard title="Authorized uploads / 已授权文件"><AuthorizedUploadsTable customerId={selectedCustomerId} documents={profile.documents} vehicles={profile.vehicles} selectedVehicleId={selectedVehicleId} /></ProCard></div> : null}
          {profile.permissions.canViewEnquiries ? <div id="customer360-enquiries"><ProCard title="Public enquiries / 公开询问"><ProfileTable columns={enquiryColumns} dataSource={profile.enquiries.filter((enquiry) => matchesVehicle(enquiry.vehicleId))} /></ProCard></div> : null}
          <div id="customer360-missing"><MissingDocumentsSummary groups={missingDocumentGroups} vehicles={profile.vehicles} /></div>
        </>
      ) : null}
    </Space>
  );
}
