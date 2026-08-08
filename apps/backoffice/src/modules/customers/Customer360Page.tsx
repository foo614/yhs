import { useEffect, useState } from "react";
import { ProCard } from "@ant-design/pro-components";
import { Alert, Button, Descriptions, Empty, Select, Space, Spin, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { MissingUploadReminder } from "../shared/MissingUploadReminder";
import {
  financeInvoiceContentUrl,
  getCustomerProfile,
  getCustomerProfileOptions,
  officialReceiptContentUrl,
  vehicleDocumentContentUrl,
  type CustomerProfile,
  type CustomerProfileDelivery,
  type CustomerProfileDocument,
  type CustomerProfileEnquiry,
  type CustomerProfileInvoice,
  type CustomerProfileLoan,
  type CustomerProfilePayment,
  type CustomerProfileReceipt,
  type CustomerProfileVehicle
} from "../../api";

const documentLabels: Record<CustomerProfileDocument["category"], string> = {
  PurchaseInvoice: "Purchase Invoice",
  Voc: "VOC",
  IdentityCard: "Identity Card",
  ApDocument: "AP Document",
  StatusReceipt: "Status Receipt",
  LoanDocument: "Loan Document",
  DeliveryDocument: "Delivery Document",
  Policy: "Policy",
  RoadTaxReceipt: "Road Tax Receipt",
  RepairInvoice: "Repair Invoice",
  PaymentReceipt: "Payment Receipt",
  PaymentInvoice: "Payment Invoice",
  MedicalCertificate: "Medical Certificate"
};

function displayValue(value?: string | number | null) {
  return value === undefined || value === null || value === "" ? "—" : value;
}

function money(value: number) {
  return `RM ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ProfileTable<RecordType extends object>({
  columns,
  dataSource
}: {
  columns: ColumnsType<RecordType>;
  dataSource: RecordType[];
}) {
  return dataSource.length > 0 ? (
    <Table<RecordType>
      columns={columns}
      dataSource={dataSource}
      pagination={false}
      rowKey={(record) => (record as { id?: string }).id ?? JSON.stringify(record)}
      scroll={{ x: true }}
      size="small"
    />
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No linked records yet." />;
}

export function Customer360Page({
  customerId,
  onCustomerChange,
  onNavigate
}: {
  customerId?: string;
  onCustomerChange: (id: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId ?? "");
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCustomerId(customerId ?? "");
  }, [customerId]);

  useEffect(() => {
    let active = true;
    void getCustomerProfileOptions()
      .then((result) => {
        if (!active) return;
        setOptions(result);
        setSelectedCustomerId((current) => current && result.some((option) => option.id === current) ? current : result[0]?.id ?? "");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Customer profile options could not be loaded.");
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) {
      setProfile(null);
      return;
    }

    let active = true;
    setLoadingProfile(true);
    setError(null);
    void getCustomerProfile(selectedCustomerId)
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch((reason: unknown) => {
        if (active) {
          setProfile(null);
          setError(reason instanceof Error ? reason.message : "Customer profile could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCustomerId]);

  const vehicleColumns: ColumnsType<CustomerProfileVehicle> = [
    { title: "Vehicle / 车辆", render: (_, vehicle) => `${vehicle.plateNumber} · ${vehicle.year} ${vehicle.make} ${vehicle.model}` },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Sold" ? "purple" : status === "Available" ? "green" : "blue"}>{status}</Tag> },
    { title: "Source / 来源", key: "source", render: () => <Button type="link" size="small" onClick={() => onNavigate("/vehicles")}>Vehicle record</Button> }
  ];
  const loanColumns: ColumnsType<CustomerProfileLoan> = [
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Approved" || status === "Done" ? "green" : "blue"}>{status}</Tag> },
    { title: "Vehicle", dataIndex: "vehicleId", render: displayValue },
    { title: "Submitted", dataIndex: "submittedAt", render: displayValue },
    { title: "LOU", render: (_, loan) => `${loan.louApproved ? "Approved" : "Pending"} / ${loan.louDone ? "Done" : "Open"}` },
    { title: "Source", key: "source", render: () => <Button type="link" size="small" onClick={() => onNavigate("/loans")}>Loan record</Button> }
  ];
  const deliveryColumns: ColumnsType<CustomerProfileDelivery> = [
    { title: "Schedule / 交车", render: (_, delivery) => `${delivery.scheduledDate} · ${delivery.status}` },
    { title: "PIC", dataIndex: "pic" },
    { title: "Coverage", render: (_, delivery) => `${delivery.insuranceHandled ? "Insurance" : "Insurance missing"}; ${delivery.roadTaxHandled ? "Road tax" : "Road tax missing"}; ${delivery.windscreenInsuranceHandled ? "Windscreen" : "Windscreen missing"}` },
    { title: "Source", key: "source", render: () => <Button type="link" size="small" onClick={() => onNavigate("/delivery")}>Delivery record</Button> }
  ];
  const paymentColumns: ColumnsType<CustomerProfilePayment> = [
    { title: "Payment", render: (_, payment) => <><Tag color={payment.status === "Reconciled" ? "green" : "blue"}>{payment.status}</Tag> {money(payment.nettPrice)}</> },
    { title: "Receipt / Invoice", render: (_, payment) => `${displayValue(payment.receiptNumber)} / ${displayValue(payment.invoiceNumber)}` },
    { title: "Created", dataIndex: "createdAt" },
    { title: "Source", key: "source", render: () => <Button type="link" size="small" onClick={() => onNavigate("/finance")}>Finance record</Button> }
  ];
  const invoiceColumns: ColumnsType<CustomerProfileInvoice> = [
    { title: "Invoice", dataIndex: "invoiceNumber" },
    { title: "Date", dataIndex: "invoiceDate" },
    { title: "Amount", dataIndex: "amount", render: money },
    { title: "File", render: (_, invoice) => <a href={financeInvoiceContentUrl(invoice.id)} target="_blank" rel="noreferrer">Download protected PDF</a> }
  ];
  const receiptColumns: ColumnsType<CustomerProfileReceipt> = [
    { title: "Receipt", dataIndex: "receiptNumber" },
    { title: "Amount", dataIndex: "amount", render: money },
    { title: "Issued", dataIndex: "createdAt" },
    { title: "File", render: (_, receipt) => <a href={officialReceiptContentUrl(receipt.cashHandoverId)} target="_blank" rel="noreferrer">Download protected PDF</a> }
  ];
  const documentColumns: ColumnsType<CustomerProfileDocument> = [
    { title: "Category", dataIndex: "category", render: (category: CustomerProfileDocument["category"]) => documentLabels[category] },
    { title: "File", dataIndex: "fileName" },
    { title: "Uploaded", render: (_, document) => `${document.uploadedAt} · ${document.uploadedBy}` },
    { title: "Action", render: (_: unknown, document: CustomerProfileDocument) => <a href={vehicleDocumentContentUrl(document.vehicleId, document.id)} target="_blank" rel="noreferrer">Download protected file</a> }
  ];
  const enquiryColumns: ColumnsType<CustomerProfileEnquiry> = [
    { title: "Status", dataIndex: "status", render: (status) => <Tag color={status === "Closed" ? "default" : status === "Contacted" ? "blue" : "orange"}>{status}</Tag> },
    { title: "Message", dataIndex: "message", render: displayValue },
    { title: "Source", dataIndex: "sourcePage", render: displayValue },
    { title: "Received", dataIndex: "createdAt" },
    { title: "Action", render: () => <Button type="link" size="small" onClick={() => onNavigate("/leads")}>Lead record</Button> }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard title="Customer 360 / 客户全景" extra={(
        <Select
          aria-label="Customer profile"
          className="customerProfileSelect"
          loading={loadingOptions}
          notFoundContent={loadingOptions ? <Spin size="small" /> : "No customer records"}
          options={options.map((option) => ({ value: option.id, label: option.name }))}
          placeholder="Choose a customer"
          showSearch
          value={selectedCustomerId || undefined}
          onChange={(value) => {
            setSelectedCustomerId(value);
            onCustomerChange(value);
          }}
        />
      )}>
        <Alert
          showIcon
          type="info"
          message="Live profile from source records"
          description="This view does not copy or merge customer data. Identity, finance, delivery, enquiry, and document sections are shown only when the signed-in role already has the matching operational access."
        />
      </ProCard>

      {error ? <Alert type="error" showIcon message="Customer profile unavailable" description={error} /> : null}
      {loadingProfile ? <ProCard><Spin /></ProCard> : null}
      {!loadingProfile && !profile && !error ? <ProCard><Empty description="Select a customer to view linked history." /></ProCard> : null}
      {profile ? (
        <>
          <ProCard title="Contact and identity / 联系与身份">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Customer ID">{profile.contact.id}</Descriptions.Item>
              <Descriptions.Item label="Name">{profile.contact.name}</Descriptions.Item>
              <Descriptions.Item label="Phone">{displayValue(profile.contact.phone)}</Descriptions.Item>
              <Descriptions.Item label="IC Number">{displayValue(profile.contact.icNumber)}</Descriptions.Item>
              <Descriptions.Item label="Email">{displayValue(profile.contact.email)}</Descriptions.Item>
              <Descriptions.Item label="Address">{displayValue(profile.contact.address)}</Descriptions.Item>
              <Descriptions.Item label="Notes" span={2}>{displayValue(profile.contact.notes)}</Descriptions.Item>
            </Descriptions>
          </ProCard>

          <ProCard title="Vehicles and purchase history / 车辆与购车历史">
            <ProfileTable columns={vehicleColumns} dataSource={profile.vehicles} />
          </ProCard>

          {profile.permissions.canViewLoans ? <ProCard title="Loans / 贷款"><ProfileTable columns={loanColumns} dataSource={profile.loans} /></ProCard> : null}
          {profile.permissions.canViewDelivery ? <ProCard title="Delivery and coverage / 交车与保障"><ProfileTable columns={deliveryColumns} dataSource={profile.deliveries} /></ProCard> : null}
          {profile.permissions.canViewFinance ? (
            <ProCard title="Payments, invoices, and receipts / 收款、发票与收据">
              <Typography.Title level={5}>Payments</Typography.Title>
              <ProfileTable columns={paymentColumns} dataSource={profile.payments} />
              <Typography.Title level={5}>Invoices</Typography.Title>
              <ProfileTable columns={invoiceColumns} dataSource={profile.invoices} />
              <Typography.Title level={5}>Official receipts</Typography.Title>
              <ProfileTable columns={receiptColumns} dataSource={profile.officialReceipts} />
            </ProCard>
          ) : null}
          {profile.permissions.canViewDocuments ? <ProCard title="Authorized uploads / 已授权文件"><ProfileTable columns={documentColumns} dataSource={profile.documents} /></ProCard> : null}
          {profile.permissions.canViewEnquiries ? <ProCard title="Public enquiries / 公开询问"><ProfileTable columns={enquiryColumns} dataSource={profile.enquiries} /></ProCard> : null}
          <MissingUploadReminder
            items={profile.missingDocuments.map((item) => ({ label: `${documentLabels[item.category]}${item.vehicleId ? ` (${item.vehicleId})` : ""}`, isPresent: false }))}
            description={profile.missingDocuments.map((item) => item.message).join(" ") || "All role-visible document requirements are present."}
            title="Missing linked documents / 缺少关联文件"
          />
        </>
      ) : null}
    </Space>
  );
}
