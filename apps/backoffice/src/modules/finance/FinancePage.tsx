import { useEffect, useState } from "react";
import { ProCard } from "@ant-design/pro-components";
import { Alert, Badge, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TablePaginationConfig } from "antd/es/table/interface";
import { OcrUploadReview, type OcrReviewValues } from "../shared/OcrUploadReview";
import {
  brokerCommissionCreateBlockReason,
  canCorrectReconciledPayment,
  canReconcilePayment,
  canReopenPaidDailySpend,
  canReopenPaidSettlement,
  dailySpendCreateBlockReason,
  debtRecoveryCreateBlockReason,
  financeDocumentCategories,
  paymentCreateBlockReason,
  paymentReconcileBlockReason,
  paymentVoucherCreateBlockReason,
  settlementCreateBlockReason
} from "../../finance";
import {
  customerSelectLabel,
  type BrokerCommission,
  type Customer,
  type DailySpend,
  type DebtRecoveryCase,
  type DocumentCategory,
  type Owner,
  type PaymentRecord,
  type PaymentVoucher,
  type SettlementReminder,
  type VehicleLookup
} from "../../api";

export function FinancePage({
  vehicles,
  customers,
  owners,
  payments,
  settlements,
  dailySpends,
  brokerCommissions,
  debtRecoveries,
  paymentVouchers,
  onCreate,
  onUpdate,
  onCreateSettlement,
  onUpdateSettlement,
  onCreateDailySpend,
  onUpdateDailySpend,
  onCreateBrokerCommission,
  onUpdateBrokerCommission,
  onCreateDebtRecovery,
  onUpdateDebtRecovery,
  onCreatePaymentVoucher,
  onUpdatePaymentVoucher,
  onUploadDocument: _onUploadDocument
}: {
  vehicles: VehicleLookup[];
  customers: Customer[];
  owners: Owner[];
  payments: PaymentRecord[];
  settlements: SettlementReminder[];
  dailySpends: DailySpend[];
  brokerCommissions: BrokerCommission[];
  debtRecoveries: DebtRecoveryCase[];
  paymentVouchers: PaymentVoucher[];
  onCreate: (payment: PaymentRecord) => void;
  onUpdate: (payment: PaymentRecord) => void;
  onCreateSettlement: (settlement: SettlementReminder) => void;
  onUpdateSettlement: (settlement: SettlementReminder) => void;
  onCreateDailySpend: (spend: DailySpend) => void;
  onUpdateDailySpend: (spend: DailySpend) => void;
  onCreateBrokerCommission: (commission: BrokerCommission) => void;
  onUpdateBrokerCommission: (commission: BrokerCommission) => void;
  onCreateDebtRecovery: (debt: DebtRecoveryCase) => void;
  onUpdateDebtRecovery: (debt: DebtRecoveryCase) => void;
  onCreatePaymentVoucher: (voucher: PaymentVoucher) => void;
  onUpdatePaymentVoucher: (voucher: PaymentVoucher) => void;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
}) {
  const [uploadPaymentId, setUploadPaymentId] = useState(payments[0]?.id ?? "");
  const [editPaymentId, setEditPaymentId] = useState(payments[0]?.id ?? "");
  const [editSettlementId, setEditSettlementId] = useState(settlements[0]?.id ?? "");
  const [editDailySpendId, setEditDailySpendId] = useState(dailySpends[0]?.id ?? "");
  const [editBrokerCommissionId, setEditBrokerCommissionId] = useState(brokerCommissions[0]?.id ?? "");
  const [editDebtRecoveryId, setEditDebtRecoveryId] = useState(debtRecoveries[0]?.id ?? "");
  const [editPaymentVoucherId, setEditPaymentVoucherId] = useState(paymentVouchers[0]?.id ?? "");
  const [financeEditorOpen, setFinanceEditorOpen] = useState<"payment" | "settlement" | "dailySpend" | "brokerCommission" | "debtRecovery" | "paymentVoucher" | null>(null);
  const [financeCreateOpen, setFinanceCreateOpen] = useState<"payment" | "settlement" | "dailySpend" | "brokerCommission" | "debtRecovery" | "paymentVoucher" | null>(null);
  const [financeTab, setFinanceTab] = useState("payments");
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>("PaymentReceipt");
  const [paymentOcrDraft, setPaymentOcrDraft] = useState<OcrReviewValues | null>(null);
  const selectedPayment = payments.find((payment) => payment.id === uploadPaymentId) ?? payments[0];
  const selectedEditPayment = payments.find((payment) => payment.id === editPaymentId) ?? payments[0];
  const vehicleOptions = vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }));
  const selectedEditSettlement = settlements.find((settlement) => settlement.id === editSettlementId) ?? settlements[0];
  const selectedEditDailySpend = dailySpends.find((spend) => spend.id === editDailySpendId) ?? dailySpends[0];
  const selectedEditBrokerCommission = brokerCommissions.find((commission) => commission.id === editBrokerCommissionId) ?? brokerCommissions[0];
  const selectedEditDebtRecovery = debtRecoveries.find((debt) => debt.id === editDebtRecoveryId) ?? debtRecoveries[0];
  const selectedEditPaymentVoucher = paymentVouchers.find((voucher) => voucher.id === editPaymentVoucherId) ?? paymentVouchers[0];

  useEffect(() => {
    if (!uploadPaymentId && payments[0]?.id) {
      setUploadPaymentId(payments[0].id);
    }
  }, [uploadPaymentId, payments]);

  useEffect(() => {
    if (!editPaymentId && payments[0]?.id) {
      setEditPaymentId(payments[0].id);
    }
  }, [editPaymentId, payments]);

  useEffect(() => {
    if (!editSettlementId && settlements[0]?.id) {
      setEditSettlementId(settlements[0].id);
    }
  }, [editSettlementId, settlements]);

  useEffect(() => {
    if (!editDailySpendId && dailySpends[0]?.id) {
      setEditDailySpendId(dailySpends[0].id);
    }
  }, [editDailySpendId, dailySpends]);

  useEffect(() => {
    if (!editBrokerCommissionId && brokerCommissions[0]?.id) {
      setEditBrokerCommissionId(brokerCommissions[0].id);
    }
  }, [editBrokerCommissionId, brokerCommissions]);

  useEffect(() => {
    if (!editDebtRecoveryId && debtRecoveries[0]?.id) {
      setEditDebtRecoveryId(debtRecoveries[0].id);
    }
  }, [editDebtRecoveryId, debtRecoveries]);

  useEffect(() => {
    if (!editPaymentVoucherId && paymentVouchers[0]?.id) {
      setEditPaymentVoucherId(paymentVouchers[0].id);
    }
  }, [editPaymentVoucherId, paymentVouchers]);

  const selectPayment = (paymentId: string) => {
    setEditPaymentId(paymentId);
    setFinanceEditorOpen("payment");
  };

  const selectSettlement = (settlementId: string) => {
    setEditSettlementId(settlementId);
    setFinanceEditorOpen("settlement");
  };

  const selectDailySpend = (spendId: string) => {
    setEditDailySpendId(spendId);
    setFinanceEditorOpen("dailySpend");
  };

  const selectBrokerCommission = (commissionId: string) => {
    setEditBrokerCommissionId(commissionId);
    setFinanceEditorOpen("brokerCommission");
  };

  const selectDebtRecovery = (debtId: string) => {
    setEditDebtRecoveryId(debtId);
    setFinanceEditorOpen("debtRecovery");
  };

  const selectPaymentVoucher = (voucherId: string) => {
    setEditPaymentVoucherId(voucherId);
    setFinanceEditorOpen("paymentVoucher");
  };

  const columns: ColumnsType<PaymentRecord> = [
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Nett Price / 净价", dataIndex: "nettPrice", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Reconciled" ? "green" : "orange"}>{status}</Tag> },
    { title: "Receipt", dataIndex: "receiptNumber", render: (value) => value || "-" },
    { title: "Invoice", dataIndex: "invoiceNumber", render: (value) => value || "-" },
    { title: "Management Review / 管理层审核", dataIndex: "bossChecked", render: (value) => <Tag color={value ? "green" : "orange"}>{value ? "Reviewed" : "Pending"}</Tag> },
    { title: "Finance Checklist", render: (_, row) => <Space wrap>{paymentChecklistTags(row)}</Space> },
    { title: shortformLabel("NCD / 无索偿折扣", "No claim discount"), dataIndex: "ncdAmount", render: (value) => `RM ${Number(value ?? 0).toLocaleString()}` },
    { title: "Windscreen / 挡风玻璃", dataIndex: "windscreenCharges", render: (value) => `RM ${Number(value ?? 0).toLocaleString()}` },
    { title: "Outstation Delivery / 外地送车", dataIndex: "outstationDeliveryDate", render: (value) => value || "-" },
    { title: "Bank", dataIndex: "bankName", render: (value) => value || "-" },
    { title: "Follow Up", dataIndex: "bankFollowUpDate", render: (value) => value || "-" },
    { title: "Created / 日期", dataIndex: "createdAt", render: (value) => String(value).slice(0, 10) },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 380,
      render: (_, row) => (
        <Space className="tableActionGroup" wrap size={6}>
          <Button size="small" type="primary" onClick={() => selectPayment(row.id)}>Details</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, status: "Disbursed" })} disabled={row.status === "Disbursed" || row.status === "Reconciled"}>Disbursed</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, bossChecked: true })} disabled={row.bossChecked || row.status === "Reconciled"}>Review</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, documentsPrepared: true, checklistValidated: true, invoiceGenerated: true, autoCountKeyed: true })} disabled={row.status === "Reconciled" || (row.documentsPrepared && row.checklistValidated && row.invoiceGenerated && row.autoCountKeyed)}>Checklist</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, status: "Disbursed" })} disabled={!canCorrectReconciledPayment(row)}>Undo</Button>
          <Button size="small" title={paymentReconcileBlockReason(row, payments)} onClick={() => onUpdate({ ...row, status: "Reconciled" })} disabled={!canReconcilePayment(row, payments)}>Reconcile</Button>
        </Space>
      )
    }
  ];
  const settlementColumns: ColumnsType<SettlementReminder> = [
    { title: "Owner / Previous Owner", dataIndex: "ownerId", render: (ownerId) => contactFor(owners, ownerId) },
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Amount / 金额", dataIndex: "amount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Deadline / 截止日期", dataIndex: "deadline" },
    { title: "Status / 状态", dataIndex: "isPaid", render: (isPaid) => <Tag color={isPaid ? "green" : "red"}>{isPaid ? "Paid" : "Due"}</Tag> },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 270,
      render: (_, row) => (
        <Space className="tableActionGroup" wrap size={6}>
          <Button size="small" type="primary" onClick={() => selectSettlement(row.id)}>Details</Button>
          <Button size="small" onClick={() => onUpdateSettlement({ ...row, isPaid: true })} disabled={row.isPaid}>Mark Paid</Button>
          <Button size="small" onClick={() => onUpdateSettlement({ ...row, isPaid: false })} disabled={!canReopenPaidSettlement(row)}>Reopen</Button>
        </Space>
      )
    }
  ];
  const dailySpendColumns: ColumnsType<DailySpend> = [
    { title: "Description / 项目", dataIndex: "description" },
    { title: "Amount / 金额", dataIndex: "amount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Due / 到期", dataIndex: "dueDate" },
    { title: "Status / 状态", dataIndex: "isPaid", render: (isPaid) => <Tag color={isPaid ? "green" : "red"}>{isPaid ? "Paid" : "Due"}</Tag> },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 190,
      render: (_, row) => (
        <Space className="tableActionGroup" wrap size={6}>
          <Button size="small" type="primary" onClick={() => selectDailySpend(row.id)}>Details</Button>
          <Button size="small" onClick={() => onUpdateDailySpend({ ...row, isPaid: true })} disabled={row.isPaid}>Mark Paid</Button>
          <Button size="small" onClick={() => onUpdateDailySpend({ ...row, isPaid: false })} disabled={!canReopenPaidDailySpend(row)}>Reopen</Button>
        </Space>
      )
    }
  ];
  const brokerCommissionColumns: ColumnsType<BrokerCommission> = [
    {
      title: shortformLabel("CP58", "Malaysian commission tax form"),
      render: (_, row) => row.cp58Required
        ? <Tag color={row.cp58Prepared ? "green" : "gold"}>{row.cp58Prepared ? "Prepared" : "Required"}</Tag>
        : <Tag>Not Required</Tag>
    },
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Broker / 经纪人", dataIndex: "brokerName" },
    { title: "Commission / 佣金", dataIndex: "amount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Status / 状态", dataIndex: "isPaid", render: (isPaid) => <Tag color={isPaid ? "green" : "orange"}>{isPaid ? "Paid" : "Unpaid"}</Tag> },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 270,
      render: (_, row) => (
        <Space className="tableActionGroup" wrap size={6}>
          <Button size="small" type="primary" onClick={() => selectBrokerCommission(row.id)}>Details</Button>
          <Button size="small" onClick={() => onUpdateBrokerCommission({ ...row, isPaid: true })} disabled={row.isPaid}>Mark Paid</Button>
          <Tooltip title="Malaysian commission tax form">
            <span>
              <Button size="small" onClick={() => onUpdateBrokerCommission({ ...row, cp58Required: true, cp58Prepared: true })} disabled={!row.cp58Required || row.cp58Prepared}>CP58</Button>
            </span>
          </Tooltip>
          <Button size="small" onClick={() => onUpdateBrokerCommission({ ...row, isPaid: false })} disabled={!row.isPaid}>Reopen</Button>
        </Space>
      )
    }
  ];
  const debtRecoveryColumns: ColumnsType<DebtRecoveryCase> = [
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Customer / 客户", dataIndex: "customerId", render: (customerId) => customerLabel(customers, customerId) },
    { title: "Balance / 欠款", dataIndex: "balanceAmount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Follow Up / 跟进", dataIndex: "followUpDate" },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Closed" ? "green" : status === "FollowedUp" ? "blue" : "orange"}>{status}</Tag> },
    { title: "Notes / 备注", dataIndex: "notes", render: (value) => value || "-" },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 210,
      render: (_, row) => (
        <Space className="tableActionGroup" wrap size={6}>
          <Button size="small" type="primary" onClick={() => selectDebtRecovery(row.id)}>Details</Button>
          <Button size="small" onClick={() => onUpdateDebtRecovery({ ...row, status: "FollowedUp" })} disabled={row.status !== "Open"}>Followed</Button>
          <Button size="small" onClick={() => onUpdateDebtRecovery({ ...row, status: "Closed" })} disabled={row.status === "Closed"}>Close</Button>
          <Button size="small" onClick={() => onUpdateDebtRecovery({ ...row, status: "Open" })} disabled={row.status === "Open"}>Reopen</Button>
        </Space>
      )
    }
  ];
  const paymentVoucherColumns: ColumnsType<PaymentVoucher> = [
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Payee / 收款人", dataIndex: "payeeName" },
    { title: "Purpose / 用途", dataIndex: "purpose" },
    { title: "Amount / 金额", dataIndex: "amount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Issued / 日期", dataIndex: "issuedDate" },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Paid" ? "green" : status === "Approved" ? "blue" : "orange"}>{status}</Tag> },
    { title: "Notes / 备注", dataIndex: "notes", render: (value) => value || "-" },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 180,
      render: (_, row) => (
        <Space className="tableActionGroup" wrap size={6}>
          <Button size="small" type="primary" onClick={() => selectPaymentVoucher(row.id)}>Details</Button>
          <Button size="small" onClick={() => onUpdatePaymentVoucher({ ...row, status: "Approved" })} disabled={row.status !== "Pending"}>Approve</Button>
          <Button size="small" onClick={() => onUpdatePaymentVoucher({ ...row, status: "Paid" })} disabled={row.status === "Paid"}>Paid</Button>
          <Button size="small" onClick={() => onUpdatePaymentVoucher({ ...row, status: "Pending" })} disabled={row.status === "Pending"}>Reopen</Button>
        </Space>
      )
    }
  ];
  const paymentTableColumns = withColumnFilters(columns, [
    { dataIndex: "vehicleId", filters: textFilters(payments.map((payment) => plateFor(vehicles, payment.vehicleId))), filterSearch: true, onFilter: (value, row) => plateFor(vehicles, row.vehicleId) === value },
    { dataIndex: "status", filters: ["Pending", "Approved", "Disbursed", "Reconciled"].map((value) => ({ text: value, value })), onFilter: (value, row) => row.status === value },
    { dataIndex: "receiptNumber", filters: textFilters(payments.map((payment) => payment.receiptNumber || "No receipt")), filterSearch: true, onFilter: (value, row) => (row.receiptNumber || "No receipt") === value },
    { dataIndex: "invoiceNumber", filters: textFilters(payments.map((payment) => payment.invoiceNumber || "No invoice")), filterSearch: true, onFilter: (value, row) => (row.invoiceNumber || "No invoice") === value },
    { dataIndex: "bossChecked", filters: [{ text: "Checked", value: true }, { text: "Pending", value: false }], onFilter: (value, row) => row.bossChecked === value },
    { dataIndex: "bankName", filters: textFilters(payments.map((payment) => payment.bankName || "No bank")), filterSearch: true, onFilter: (value, row) => (row.bankName || "No bank") === value }
  ]);
  const settlementTableColumns = withColumnFilters(settlementColumns, [
    { dataIndex: "ownerId", filters: textFilters(settlements.map((settlement) => contactFor(owners, settlement.ownerId))), filterSearch: true, onFilter: (value, row) => contactFor(owners, row.ownerId) === value },
    { dataIndex: "vehicleId", filters: textFilters(settlements.map((settlement) => plateFor(vehicles, settlement.vehicleId))), filterSearch: true, onFilter: (value, row) => plateFor(vehicles, row.vehicleId) === value },
    { dataIndex: "isPaid", filters: [{ text: "Paid", value: true }, { text: "Due", value: false }], onFilter: (value, row) => row.isPaid === value }
  ]);
  const dailySpendTableColumns = withColumnFilters(dailySpendColumns, [
    { dataIndex: "description", filters: textFilters(dailySpends.map((spend) => spend.description)), filterSearch: true, onFilter: (value, row) => row.description === value },
    { dataIndex: "isPaid", filters: [{ text: "Paid", value: true }, { text: "Due", value: false }], onFilter: (value, row) => row.isPaid === value }
  ]);
  const brokerCommissionTableColumns = withColumnFilters(brokerCommissionColumns, [
    { dataIndex: "vehicleId", filters: textFilters(brokerCommissions.map((commission) => plateFor(vehicles, commission.vehicleId))), filterSearch: true, onFilter: (value, row) => plateFor(vehicles, row.vehicleId) === value },
    { dataIndex: "brokerName", filters: textFilters(brokerCommissions.map((commission) => commission.brokerName)), filterSearch: true, onFilter: (value, row) => row.brokerName === value },
    { dataIndex: "isPaid", filters: [{ text: "Paid", value: true }, { text: "Unpaid", value: false }], onFilter: (value, row) => row.isPaid === value }
  ]);
  const debtRecoveryTableColumns = withColumnFilters(debtRecoveryColumns, [
    { dataIndex: "vehicleId", filters: textFilters(debtRecoveries.map((debt) => plateFor(vehicles, debt.vehicleId))), filterSearch: true, onFilter: (value, row) => plateFor(vehicles, row.vehicleId) === value },
    { dataIndex: "customerId", filters: textFilters(debtRecoveries.map((debt) => customerLabel(customers, debt.customerId))), filterSearch: true, onFilter: (value, row) => customerLabel(customers, row.customerId) === value },
    { dataIndex: "status", filters: ["Open", "FollowedUp", "Closed"].map((value) => ({ text: value, value })), onFilter: (value, row) => row.status === value }
  ]);
  const paymentVoucherTableColumns = withColumnFilters(paymentVoucherColumns, [
    { dataIndex: "vehicleId", filters: textFilters(paymentVouchers.map((voucher) => plateFor(vehicles, voucher.vehicleId))), filterSearch: true, onFilter: (value, row) => plateFor(vehicles, row.vehicleId) === value },
    { dataIndex: "payeeName", filters: textFilters(paymentVouchers.map((voucher) => voucher.payeeName)), filterSearch: true, onFilter: (value, row) => row.payeeName === value },
    { dataIndex: "purpose", filters: textFilters(paymentVouchers.map((voucher) => voucher.purpose)), filterSearch: true, onFilter: (value, row) => row.purpose === value },
    { dataIndex: "status", filters: ["Pending", "Approved", "Paid"].map((value) => ({ text: value, value })), onFilter: (value, row) => row.status === value }
  ]);
  const outstanding = payments.filter((payment) => payment.status !== "Reconciled").reduce((sum, payment) => sum + payment.nettPrice, 0);
  const settlementOutstanding = settlements.filter((settlement) => !settlement.isPaid).reduce((sum, settlement) => sum + settlement.amount, 0);
  const dailySpendOutstanding = dailySpends.filter((spend) => !spend.isPaid).reduce((sum, spend) => sum + spend.amount, 0);
  const brokerCommissionOutstanding = brokerCommissions.filter((commission) => !commission.isPaid).reduce((sum, commission) => sum + commission.amount, 0);
  const debtOutstanding = debtRecoveries.filter((debt) => debt.status !== "Closed").reduce((sum, debt) => sum + debt.balanceAmount, 0);
  const voucherOutstanding = paymentVouchers.filter((voucher) => voucher.status !== "Paid").reduce((sum, voucher) => sum + voucher.amount, 0);

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard>
        <Tabs
          activeKey={financeTab}
          onChange={setFinanceTab}
          items={[
            { key: "payments", label: "Bank Collection / 收款Bank" },
            { key: "settlements", label: "Settlement / 结算" },
            { key: "commissions", label: "Broker Commission / 经纪佣金" },
            { key: "debt", label: "Debt Recovery / 欠款追讨" },
            { key: "vouchers", label: "Payment Voucher / 付款凭证" },
            { key: "daily", label: "Daily Spend / 日常支出" }
          ]}
        />
      </ProCard>
      {financeTab === "payments" && <ProCard
        title="Bank Collection / 收款Bank"
        extra={<Button type="primary" onClick={() => setFinanceCreateOpen("payment")}>New Payment</Button>}
      >
        <div className="mobileRecordList">
          {payments.map((payment) => (
            <article className="mobileRecordCard" key={payment.id}>
              <div className="mobileRecordHeader">
                <div>
                  <Typography.Text className="mobileRecordEyebrow">Car Plate / 车牌</Typography.Text>
                  <Typography.Title level={5}>{plateFor(vehicles, payment.vehicleId)}</Typography.Title>
                </div>
                <Tag color={payment.status === "Reconciled" ? "green" : "orange"}>{payment.status}</Tag>
              </div>
              <div className="mobileRecordMeta">
                <span><small>Nett Price / 净价</small><strong>RM {payment.nettPrice.toLocaleString()}</strong></span>
                <span><small>Bank Follow Up / 银行跟进</small><strong>{payment.bankFollowUpDate || "-"}</strong></span>
              </div>
              <div className="mobileRecordSection">
                <Typography.Text className="mobileRecordLabel">Finance Checklist / 财务检查</Typography.Text>
                <Space wrap size={4}>{paymentChecklistTags(payment)}</Space>
              </div>
              <div className="mobileRecordFooter">
                <Space wrap size={6}>
                  <Badge status={payment.bossChecked ? "success" : "warning"} text={payment.bossChecked ? "Management reviewed" : "Review pending"} />
                  <Tag>{payment.receiptNumber || "No receipt"}</Tag>
                  <Tag>{payment.invoiceNumber || "No invoice"}</Tag>
                </Space>
                <Space className="tableActionGroup" wrap size={6}>
                  <Button size="small" type="primary" onClick={() => selectPayment(payment.id)}>Details</Button>
                  <Button size="small" onClick={() => onUpdate({ ...payment, status: "Disbursed" })} disabled={payment.status === "Disbursed" || payment.status === "Reconciled"}>Disbursed</Button>
                  <Button size="small" onClick={() => onUpdate({ ...payment, bossChecked: true })} disabled={payment.bossChecked || payment.status === "Reconciled"}>Review</Button>
                  <Button size="small" onClick={() => onUpdate({ ...payment, status: "Reconciled" })} disabled={!canReconcilePayment(payment, payments)}>Reconcile</Button>
                </Space>
              </div>
            </article>
          ))}
        </div>
        <Table className="desktopDataTable" rowKey="id" columns={paymentTableColumns} dataSource={payments} pagination={tablePagination(8)} scroll={{ x: 1040 }} />
      </ProCard>}
      <Modal
        title="New Payment / 新增收款"
        width={680}
        open={financeCreateOpen === "payment"}
        onCancel={() => setFinanceCreateOpen(null)}
        footer={null}
        destroyOnClose
        className="recordCreateModal"
      >
        <Form layout="vertical" className="modalForm" onFinish={(values) => {
          const payment: PaymentRecord = {
            id: newId(),
            vehicleId: values.vehicleId,
            nettPrice: Number(values.nettPrice ?? 0),
            status: values.status,
            receiptNumber: values.receiptNumber,
            invoiceNumber: values.invoiceNumber,
            bossChecked: values.bossChecked,
            documentsPrepared: values.documentsPrepared,
            checklistValidated: values.checklistValidated,
            invoiceGenerated: values.invoiceGenerated,
            autoCountKeyed: values.autoCountKeyed,
            salesPrice: Number(values.salesPrice ?? 0),
            interestAdditionalCharges: Number(values.interestAdditionalCharges ?? 0),
            ncdAmount: Number(values.ncdAmount ?? 0),
            windscreenCharges: Number(values.windscreenCharges ?? 0),
            outstationDeliveryDate: values.outstationDeliveryDate,
            bankName: values.bankName,
            bankFollowUpDate: values.bankFollowUpDate,
            createdAt: new Date().toISOString()
          };
          const blockReason = paymentCreateBlockReason(payment, payments);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }
          onCreate(payment);
          setFinanceCreateOpen(null);
        }} initialValues={{ vehicleId: vehicles[0]?.id, status: "Pending", bossChecked: false, documentsPrepared: false, checklistValidated: false, invoiceGenerated: false, autoCountKeyed: false }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="nettPrice" label="Nett Price"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Pending", "Approved", "Disbursed", "Reconciled"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="receiptNumber" label="Receipt No."><Input placeholder="RCPT-1001" /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice No."><Input placeholder="INV-1001" /></Form.Item>
          <Form.Item name="bossChecked" label="Management Review / 管理层审核"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Reviewed" }]} /></Form.Item>
          <Form.Item name="documentsPrepared" label="Prepare Document"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="checklistValidated" label="Checklist Validation"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="invoiceGenerated" label="Invoice Generated"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="autoCountKeyed" label={shortformLabel("AutoCount Key In", "Accounting system entry status")}><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="salesPrice" label="Sales Price / 销售价格"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="interestAdditionalCharges" label="Interest + Additional Charges / 利息与增加项"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="ncdAmount" label={shortformLabel("NCD / 无索偿折扣", "No claim discount")}><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="windscreenCharges" label="Windscreen Charges / 挡风玻璃费用"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="outstationDeliveryDate" label="Outstation Delivery Date / 外地送车日期"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="bankName" label="Bank"><Input placeholder="Maybank" /></Form.Item>
          <Form.Item name="bankFollowUpDate" label="Bank Follow-up"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Payment</Button></Form.Item>
        </Form>
      </Modal>
      {false && <ProCard title="Payment Entry / 收款记录">
        <Form layout="vertical" className="formGrid" onFinish={(values) => {
          const payment: PaymentRecord = {
            id: newId(),
            vehicleId: values.vehicleId,
            nettPrice: Number(values.nettPrice ?? 0),
            status: values.status,
            receiptNumber: values.receiptNumber,
            invoiceNumber: values.invoiceNumber,
            bossChecked: values.bossChecked,
            documentsPrepared: values.documentsPrepared,
            checklistValidated: values.checklistValidated,
            invoiceGenerated: values.invoiceGenerated,
            autoCountKeyed: values.autoCountKeyed,
            salesPrice: Number(values.salesPrice ?? 0),
            interestAdditionalCharges: Number(values.interestAdditionalCharges ?? 0),
            ncdAmount: Number(values.ncdAmount ?? 0),
            windscreenCharges: Number(values.windscreenCharges ?? 0),
            outstationDeliveryDate: values.outstationDeliveryDate,
            bankName: values.bankName,
            bankFollowUpDate: values.bankFollowUpDate,
            createdAt: new Date().toISOString()
          };
          const blockReason = paymentCreateBlockReason(payment, payments);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }
          onCreate(payment);
        }} initialValues={{ vehicleId: vehicles[0]?.id, status: "Pending", bossChecked: false, documentsPrepared: false, checklistValidated: false, invoiceGenerated: false, autoCountKeyed: false }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="nettPrice" label="Nett Price"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Pending", "Approved", "Disbursed", "Reconciled"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="receiptNumber" label="Receipt No."><Input placeholder="RCPT-1001" /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice No."><Input placeholder="INV-1001" /></Form.Item>
          <Form.Item name="bossChecked" label="Management Review / 管理层审核"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Reviewed" }]} /></Form.Item>
          <Form.Item name="documentsPrepared" label="Prepare Document"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="checklistValidated" label="Checklist Validation"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="invoiceGenerated" label="Invoice Generated"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="autoCountKeyed" label={shortformLabel("AutoCount Key In", "Accounting system entry status")}><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="salesPrice" label="Sales Price / 销售价格"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="interestAdditionalCharges" label="Interest + Additional Charges / 利息与增加项"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="ncdAmount" label={shortformLabel("NCD / 无索偿折扣", "No claim discount")}><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="windscreenCharges" label="Windscreen Charges / 挡风玻璃费用"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="outstationDeliveryDate" label="Outstation Delivery Date / 外地送车日期"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="bankName" label="Bank"><Input placeholder="Maybank" /></Form.Item>
          <Form.Item name="bankFollowUpDate" label="Bank Follow-up"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Payment</Button></Form.Item>
        </Form>
      </ProCard>}
      <Drawer
        title="Payment Details / 收款详情"
        width={560}
        open={financeEditorOpen === "payment"}
        onClose={() => {
          setFinanceEditorOpen(null);
          setPaymentOcrDraft(null);
        }}
        destroyOnClose
        className="recordEditDrawer"
      >
        <Form
          key={`${selectedEditPayment?.id ?? "payment-edit"}-${paymentOcrDraft ? "ocr" : "manual"}`}
          layout="vertical"
          className="drawerForm"
          initialValues={{ ...selectedEditPayment, ...paymentOcrDraft }}
          onFinish={(values) => {
            if (!selectedEditPayment) return;
            const payment: PaymentRecord = {
              ...selectedEditPayment,
              vehicleId: values.vehicleId,
              nettPrice: Number(values.nettPrice ?? 0),
              status: values.status,
              receiptNumber: values.receiptNumber?.trim() || undefined,
              invoiceNumber: values.invoiceNumber?.trim() || undefined,
              bossChecked: values.bossChecked,
              documentsPrepared: values.documentsPrepared,
              checklistValidated: values.checklistValidated,
              invoiceGenerated: values.invoiceGenerated,
              autoCountKeyed: values.autoCountKeyed,
              salesPrice: Number(values.salesPrice ?? 0),
              interestAdditionalCharges: Number(values.interestAdditionalCharges ?? 0),
              ncdAmount: Number(values.ncdAmount ?? 0),
              windscreenCharges: Number(values.windscreenCharges ?? 0),
              outstationDeliveryDate: values.outstationDeliveryDate?.trim() || undefined,
              bankName: values.bankName?.trim() || undefined,
              bankFollowUpDate: values.bankFollowUpDate?.trim() || undefined
            };
            const blockReason = paymentCreateBlockReason(payment, payments);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onUpdate(payment);
            setPaymentOcrDraft(null);
            setFinanceEditorOpen(null);
          }}
        >
          <Form.Item name="id" label="Selected Payment"><Select options={payments.map((payment) => ({ value: payment.id, label: `${plateFor(vehicles, payment.vehicleId)} / ${payment.receiptNumber || "No receipt"} / ${payment.status}` }))} onChange={selectPayment} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="nettPrice" label="Nett Price"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Pending", "Approved", "Disbursed", "Reconciled"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="receiptNumber" label="Receipt No."><Input placeholder="RCPT-1001" /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice No."><Input placeholder="INV-1001" /></Form.Item>
          <Form.Item name="bossChecked" label="Management Review / 管理层审核"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Reviewed" }]} /></Form.Item>
          <Form.Item name="documentsPrepared" label="Prepare Document"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="checklistValidated" label="Checklist Validation"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="invoiceGenerated" label="Invoice Generated"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="autoCountKeyed" label={shortformLabel("AutoCount Key In", "Accounting system entry status")}><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="salesPrice" label="Sales Price / 销售价格"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="interestAdditionalCharges" label="Interest + Additional Charges / 利息与增加项"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="ncdAmount" label={shortformLabel("NCD / 无索偿折扣", "No claim discount")}><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="windscreenCharges" label="Windscreen Charges / 挡风玻璃费用"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="outstationDeliveryDate" label="Outstation Delivery Date / 外地送车日期"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="bankName" label="Bank"><Input placeholder="Maybank" /></Form.Item>
          <Form.Item name="bankFollowUpDate" label="Bank Follow-up"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditPayment}>Update Payment</Button></Form.Item>
        </Form>
      </Drawer>
      {financeTab === "payments" && <ProCard title="Finance Documents / 财务文件">
        <Space direction="vertical" size={12} className="fullWidth">
          <Form layout="vertical" className="formGrid">
            <Form.Item label="Payment Record / 收款记录">
              <Select
                value={selectedPayment?.id}
                onChange={setUploadPaymentId}
                options={payments.map((payment) => ({
                  value: payment.id,
                  label: `${plateFor(vehicles, payment.vehicleId)} / ${payment.receiptNumber || "No receipt"} / ${payment.invoiceNumber || "No invoice"}`
                }))}
              />
            </Form.Item>
            <Form.Item label="Document Type / 文件类型">
              <Select<DocumentCategory>
                value={documentCategory}
                onChange={setDocumentCategory}
                options={financeDocumentCategories.map((category) => ({ value: category, label: documentCategoryLabel(category) }))}
              />
            </Form.Item>
            <Form.Item label="Receipt / Invoice Upload / 收据与发票上传">
              <OcrUploadReview
                vehicleId={selectedPayment?.vehicleId}
                category={documentCategory}
                disabled={!selectedPayment}
                buttonLabel="Upload & OCR Finance Document"
                applyLabel="Apply to Payment"
                fields={[
                  { name: "vehicleId", label: "Car Plate", type: "select", options: vehicleOptions },
                  { name: "receiptNumber", label: "Receipt No." },
                  { name: "invoiceNumber", label: "Invoice No." },
                  { name: "nettPrice", label: "Nett Price", type: "number" },
                  { name: "salesPrice", label: "Sales Price", type: "number" },
                  { name: "bankName", label: "Bank" },
                  { name: "bankFollowUpDate", label: "Bank Follow-up" }
                ]}
                onApply={(values) => {
                  if (selectedPayment) setEditPaymentId(selectedPayment.id);
                  setPaymentOcrDraft(values);
                  setFinanceEditorOpen("payment");
                }}
              />
            </Form.Item>
          </Form>
          <Alert
            type="info"
            showIcon
            message="Upload payment receipts and invoices against the linked car plate for finance audit and reconciliation. / 上传收据和发票并关联车牌,方便财务审核与对账。"
          />
        </Space>
      </ProCard>}
      {financeTab === "settlements" && <ProCard
        id="settlement-list-card"
        title="Settlement Reminder / 收车结算提醒"
        extra={<Button type="primary" onClick={() => setFinanceCreateOpen("settlement")}>New Settlement</Button>}
      >
        <Space direction="vertical" size={16} className="fullWidth">
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Deadline Popup">Admin receives reminder when settlement deadline is due.</Descriptions.Item>
            <Descriptions.Item label={shortformLabel("AutoCount", "Accounting system")}>Extension point prepared; MVP tracks key-in status manually.</Descriptions.Item>
            <Descriptions.Item label="Outstanding Bank Collection">RM {outstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Outstanding Settlement">RM {settlementOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Daily Spend Due">RM {dailySpendOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Broker Commission Due">RM {brokerCommissionOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Debt Recovery Balance">RM {debtOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Payment Voucher Open">RM {voucherOutstanding.toLocaleString()}</Descriptions.Item>
          </Descriptions>
          <div className="mobileRecordList">
            {settlements.map((settlement) => (
              <article className="mobileRecordCard" key={settlement.id}>
                <div className="mobileRecordHeader">
                  <div>
                    <Typography.Text className="mobileRecordEyebrow">Car Plate / 车牌</Typography.Text>
                    <Typography.Title level={5}>{plateFor(vehicles, settlement.vehicleId)}</Typography.Title>
                  </div>
                  <Tag color={settlement.isPaid ? "green" : "red"}>{settlement.isPaid ? "Paid" : "Due"}</Tag>
                </div>
                <div className="mobileRecordMeta">
                  <span><small>Owner / Previous Owner</small><strong>{contactFor(owners, settlement.ownerId)}</strong></span>
                  <span><small>Amount / 金额</small><strong>RM {settlement.amount.toLocaleString()}</strong></span>
                </div>
                <div className="mobileRecordFooter">
                  <Tag>Deadline: {settlement.deadline}</Tag>
                  <Space className="tableActionGroup" wrap size={6}>
                    <Button size="small" type="primary" onClick={() => selectSettlement(settlement.id)}>Details</Button>
                    <Button size="small" onClick={() => onUpdateSettlement({ ...settlement, isPaid: true })} disabled={settlement.isPaid}>Mark Paid</Button>
                    <Button size="small" onClick={() => onUpdateSettlement({ ...settlement, isPaid: false })} disabled={!canReopenPaidSettlement(settlement)}>Reopen</Button>
                  </Space>
                </div>
              </article>
            ))}
          </div>
          <Table className="desktopDataTable" rowKey="id" columns={settlementTableColumns} dataSource={settlements} pagination={tablePagination(8)} scroll={{ x: 640 }} />
          <Modal
            title="New Settlement / 新增结算提醒"
            width={620}
            open={financeCreateOpen === "settlement"}
            onCancel={() => setFinanceCreateOpen(null)}
            footer={null}
            destroyOnClose
            className="recordCreateModal"
          >
          <Form layout="vertical" className="modalForm" onFinish={(values) => {
            const settlement: SettlementReminder = {
              id: newId(),
              vehicleId: values.vehicleId,
              ownerId: values.ownerId,
              amount: Number(values.amount ?? 0),
              deadline: values.deadline,
              isPaid: values.isPaid
            };
            const blockReason = settlementCreateBlockReason(settlement, owners);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreateSettlement(settlement);
            setFinanceCreateOpen(null);
          }} initialValues={{ vehicleId: vehicles[0]?.id, deadline: today(), isPaid: false }}>
            <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="ownerId" label="Settlement Owner / Previous Owner"><Select allowClear showSearch optionFilterProp="label" options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} /></Form.Item>
            <Form.Item name="amount" label="Settlement Amount" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="deadline" label="Deadline" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="isPaid" label="Status"><Select options={[{ value: false, label: "Due" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Settlement</Button></Form.Item>
          </Form>
          </Modal>
        </Space>
      </ProCard>}
      <Drawer
        title="Settlement Details / 结算详情"
        width={560}
        open={financeEditorOpen === "settlement"}
        onClose={() => setFinanceEditorOpen(null)}
        destroyOnClose
        className="recordEditDrawer"
      >
          <Form
            key={selectedEditSettlement?.id ?? "settlement-edit"}
            layout="vertical"
            className="drawerForm"
            initialValues={selectedEditSettlement}
            onFinish={(values) => {
              if (!selectedEditSettlement) return;
              const settlement: SettlementReminder = {
                ...selectedEditSettlement,
                vehicleId: values.vehicleId,
                ownerId: values.ownerId,
                amount: Number(values.amount ?? 0),
                deadline: values.deadline,
                isPaid: values.isPaid
              };
              const blockReason = settlementCreateBlockReason(settlement, owners);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }
              onUpdateSettlement(settlement);
              setFinanceEditorOpen(null);
            }}
          >
            <Form.Item name="id" label="Selected Settlement"><Select options={settlements.map((settlement) => ({ value: settlement.id, label: `${plateFor(vehicles, settlement.vehicleId)} / RM ${settlement.amount.toLocaleString()} / ${settlement.deadline}` }))} onChange={selectSettlement} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="ownerId" label="Settlement Owner / Previous Owner"><Select allowClear showSearch optionFilterProp="label" options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} /></Form.Item>
            <Form.Item name="amount" label="Settlement Amount" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="deadline" label="Deadline" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="isPaid" label="Status"><Select options={[{ value: false, label: "Due" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditSettlement}>Update Settlement</Button></Form.Item>
          </Form>
      </Drawer>
      {financeTab === "commissions" && <ProCard
        id="broker-commission-list-card"
        title="Broker Commission / 经纪人佣金"
        extra={<Button type="primary" onClick={() => setFinanceCreateOpen("brokerCommission")}>New Commission</Button>}
      >
        <Space direction="vertical" size={12} className="fullWidth">
          <div className="mobileRecordList">
            {brokerCommissions.map((commission) => (
              <article className="mobileRecordCard" key={commission.id}>
                <div className="mobileRecordHeader">
                  <div>
                    <Typography.Text className="mobileRecordEyebrow">Broker / 经纪人</Typography.Text>
                    <Typography.Title level={5}>{commission.brokerName}</Typography.Title>
                  </div>
                  <Tag color={commission.isPaid ? "green" : "orange"}>{commission.isPaid ? "Paid" : "Unpaid"}</Tag>
                </div>
                <div className="mobileRecordMeta">
                  <span><small>Car Plate / 车牌</small><strong>{plateFor(vehicles, commission.vehicleId)}</strong></span>
                  <span><small>Commission / 佣金</small><strong>RM {commission.amount.toLocaleString()}</strong></span>
                </div>
                <div className="mobileRecordFooter">
                  <Tag color={commission.cp58Required ? commission.cp58Prepared ? "green" : "gold" : "default"}>
                    {commission.cp58Required ? commission.cp58Prepared ? "CP58 prepared" : "CP58 required" : "CP58 not required"}
                  </Tag>
                  <Space className="tableActionGroup" wrap size={6}>
                    <Button size="small" type="primary" onClick={() => selectBrokerCommission(commission.id)}>Details</Button>
                    <Button size="small" onClick={() => onUpdateBrokerCommission({ ...commission, isPaid: true })} disabled={commission.isPaid}>Mark Paid</Button>
                    <Tooltip title="Malaysian commission tax form">
                      <span>
                        <Button size="small" onClick={() => onUpdateBrokerCommission({ ...commission, cp58Required: true, cp58Prepared: true })} disabled={!commission.cp58Required || commission.cp58Prepared}>CP58</Button>
                      </span>
                    </Tooltip>
                    <Button size="small" onClick={() => onUpdateBrokerCommission({ ...commission, isPaid: false })} disabled={!commission.isPaid}>Reopen</Button>
                  </Space>
                </div>
              </article>
            ))}
          </div>
          <Table className="desktopDataTable" rowKey="id" columns={brokerCommissionTableColumns} dataSource={brokerCommissions} pagination={tablePagination(8)} scroll={{ x: 760 }} />
          <Modal
            title="New Broker Commission / 新增经纪人佣金"
            width={620}
            open={financeCreateOpen === "brokerCommission"}
            onCancel={() => setFinanceCreateOpen(null)}
            footer={null}
            destroyOnClose
            className="recordCreateModal"
          >
          <Form layout="vertical" className="modalForm" onFinish={(values) => {
            const commission: BrokerCommission = {
              id: newId(),
              vehicleId: values.vehicleId,
              brokerName: values.brokerName,
              amount: Number(values.amount ?? 0),
              isPaid: values.isPaid,
              cp58Required: values.cp58Required,
              cp58Prepared: values.cp58Prepared
            };
            const blockReason = brokerCommissionCreateBlockReason(commission, vehicles);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreateBrokerCommission(commission);
            setFinanceCreateOpen(null);
          }} initialValues={{ vehicleId: vehicles[0]?.id, isPaid: false, cp58Required: false, cp58Prepared: false }}>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="brokerName" label="Broker / 经纪人" rules={[{ required: true }]}><Input placeholder="Broker name" /></Form.Item>
            <Form.Item name="amount" label="Commission / 佣金" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="isPaid" label="Status / 状态"><Select options={[{ value: false, label: "Unpaid" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item name="cp58Required" label={shortformLabel("CP58 Required", "Malaysian commission tax form required")}><Select options={[{ value: false, label: "No" }, { value: true, label: "Yes" }]} /></Form.Item>
            <Form.Item name="cp58Prepared" label={shortformLabel("CP58 Prepared", "Malaysian commission tax form prepared")}><Select options={[{ value: false, label: "No" }, { value: true, label: "Yes" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Commission</Button></Form.Item>
          </Form>
          </Modal>
        </Space>
      </ProCard>}
      <Drawer
        title="Broker Commission Details / 经纪人佣金详情"
        width={560}
        open={financeEditorOpen === "brokerCommission"}
        onClose={() => setFinanceEditorOpen(null)}
        destroyOnClose
        className="recordEditDrawer"
      >
          <Form
            key={selectedEditBrokerCommission?.id ?? "broker-commission-edit"}
            layout="vertical"
            className="drawerForm"
            initialValues={selectedEditBrokerCommission}
            onFinish={(values) => {
              if (!selectedEditBrokerCommission) return;
              const commission: BrokerCommission = {
                ...selectedEditBrokerCommission,
                vehicleId: values.vehicleId,
                brokerName: values.brokerName,
                amount: Number(values.amount ?? 0),
                isPaid: values.isPaid,
                cp58Required: values.cp58Required,
                cp58Prepared: values.cp58Prepared
              };
              const blockReason = brokerCommissionCreateBlockReason(commission, vehicles);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }
              onUpdateBrokerCommission(commission);
              setFinanceEditorOpen(null);
            }}
          >
            <Form.Item name="id" label="Selected Broker Commission"><Select options={brokerCommissions.map((commission) => ({ value: commission.id, label: `${plateFor(vehicles, commission.vehicleId)} / ${commission.brokerName} / RM ${commission.amount.toLocaleString()}` }))} onChange={selectBrokerCommission} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="brokerName" label="Broker / 经纪人" rules={[{ required: true }]}><Input placeholder="Broker name" /></Form.Item>
            <Form.Item name="amount" label="Commission / 佣金" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="isPaid" label="Status / 状态"><Select options={[{ value: false, label: "Unpaid" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item name="cp58Required" label={shortformLabel("CP58 Required", "Malaysian commission tax form required")}><Select options={[{ value: false, label: "No" }, { value: true, label: "Yes" }]} /></Form.Item>
            <Form.Item name="cp58Prepared" label={shortformLabel("CP58 Prepared", "Malaysian commission tax form prepared")}><Select options={[{ value: false, label: "No" }, { value: true, label: "Yes" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditBrokerCommission}>Update Commission</Button></Form.Item>
          </Form>
      </Drawer>
      {financeTab === "debt" && <ProCard
        id="debt-recovery-list-card"
        title="Debt Recovery / 欠款追讨"
        extra={<Button type="primary" onClick={() => setFinanceCreateOpen("debtRecovery")}>New Debt Case</Button>}
      >
        <Space direction="vertical" size={12} className="fullWidth">
          <div className="mobileRecordList">
            {debtRecoveries.map((debt) => (
              <article className="mobileRecordCard" key={debt.id}>
                <div className="mobileRecordHeader">
                  <div>
                    <Typography.Text className="mobileRecordEyebrow">Car Plate / 车牌</Typography.Text>
                    <Typography.Title level={5}>{plateFor(vehicles, debt.vehicleId)}</Typography.Title>
                  </div>
                  <Tag color={debt.status === "Closed" ? "green" : "orange"}>{debt.status}</Tag>
                </div>
                <div className="mobileRecordMeta">
                  <span><small>Customer / 客户</small><strong>{customerLabel(customers, debt.customerId)}</strong></span>
                  <span><small>Balance / 欠款</small><strong>RM {debt.balanceAmount.toLocaleString()}</strong></span>
                </div>
                <div className="mobileRecordSection">
                  <Typography.Text className="mobileRecordLabel">Notes / 备注</Typography.Text>
                  <div className="mobileRecordTextBlock"><span>{debt.notes || "-"}</span></div>
                </div>
                <div className="mobileRecordFooter">
                  <Tag>Follow-up: {debt.followUpDate}</Tag>
                  <Button size="small" type="primary" onClick={() => selectDebtRecovery(debt.id)}>Details</Button>
                </div>
              </article>
            ))}
          </div>
          <Table className="desktopDataTable" rowKey="id" columns={debtRecoveryTableColumns} dataSource={debtRecoveries} pagination={tablePagination(8)} scroll={{ x: 960 }} />
          <Modal
            title="New Debt Recovery Case / 新增欠款追讨"
            width={620}
            open={financeCreateOpen === "debtRecovery"}
            onCancel={() => setFinanceCreateOpen(null)}
            footer={null}
            destroyOnClose
            className="recordCreateModal"
          >
          <Form layout="vertical" className="modalForm" onFinish={(values) => {
            const debt: DebtRecoveryCase = {
              id: newId(),
              vehicleId: values.vehicleId,
              customerId: values.customerId,
              balanceAmount: Number(values.balanceAmount ?? 0),
              status: values.status,
              followUpDate: values.followUpDate,
              notes: values.notes
            };
            const blockReason = debtRecoveryCreateBlockReason(debt, vehicles, customers);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreateDebtRecovery(debt);
            setFinanceCreateOpen(null);
          }} initialValues={{ vehicleId: vehicles[0]?.id, customerId: customers[0]?.id, status: "Open", followUpDate: today() }}>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="customerId" label="Customer / 客户" rules={[{ required: true }]}><Select options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} /></Form.Item>
            <Form.Item name="balanceAmount" label="Balance / 欠款" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="followUpDate" label="Follow-up Date / 跟进日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="status" label="Status / 状态"><Select options={["Open", "FollowedUp", "Closed"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Balance reminder note" /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Debt Case</Button></Form.Item>
          </Form>
          </Modal>
        </Space>
      </ProCard>}
      <Drawer
        title="Debt Case Details / 欠款追讨详情"
        width={560}
        open={financeEditorOpen === "debtRecovery"}
        onClose={() => setFinanceEditorOpen(null)}
        destroyOnClose
        className="recordEditDrawer"
      >
          <Form
            key={selectedEditDebtRecovery?.id ?? "debt-recovery-edit"}
            layout="vertical"
            className="drawerForm"
            initialValues={selectedEditDebtRecovery}
            onFinish={(values) => {
              if (!selectedEditDebtRecovery) return;
              const debt: DebtRecoveryCase = {
                ...selectedEditDebtRecovery,
                vehicleId: values.vehicleId,
                customerId: values.customerId,
                balanceAmount: Number(values.balanceAmount ?? 0),
                status: values.status,
                followUpDate: values.followUpDate,
                notes: values.notes?.trim() || undefined
              };
              const blockReason = debtRecoveryCreateBlockReason(debt, vehicles, customers);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }
              onUpdateDebtRecovery(debt);
              setFinanceEditorOpen(null);
            }}
          >
            <Form.Item name="id" label="Selected Debt Case"><Select options={debtRecoveries.map((debt) => ({ value: debt.id, label: `${plateFor(vehicles, debt.vehicleId)} / ${customerLabel(customers, debt.customerId)} / RM ${debt.balanceAmount.toLocaleString()}` }))} onChange={selectDebtRecovery} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="customerId" label="Customer / 客户" rules={[{ required: true }]}><Select options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} /></Form.Item>
            <Form.Item name="balanceAmount" label="Balance / 欠款" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="followUpDate" label="Follow-up Date / 跟进日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="status" label="Status / 状态"><Select options={["Open", "FollowedUp", "Closed"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Balance reminder note" /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditDebtRecovery}>Update Debt Case</Button></Form.Item>
          </Form>
      </Drawer>
      {financeTab === "vouchers" && <ProCard
        id="payment-voucher-list-card"
        title="Payment Voucher / 付款凭证"
        extra={<Button type="primary" onClick={() => setFinanceCreateOpen("paymentVoucher")}>New Voucher</Button>}
      >
        <Space direction="vertical" size={12} className="fullWidth">
          <div className="mobileRecordList">
            {paymentVouchers.map((voucher) => (
              <article className="mobileRecordCard" key={voucher.id}>
                <div className="mobileRecordHeader">
                  <div>
                    <Typography.Text className="mobileRecordEyebrow">Payee / 收款人</Typography.Text>
                    <Typography.Title level={5}>{voucher.payeeName}</Typography.Title>
                  </div>
                  <Tag color={voucher.status === "Paid" ? "green" : voucher.status === "Approved" ? "blue" : "orange"}>{voucher.status}</Tag>
                </div>
                <div className="mobileRecordMeta">
                  <span><small>Car Plate / 车牌</small><strong>{plateFor(vehicles, voucher.vehicleId)}</strong></span>
                  <span><small>Amount / 金额</small><strong>RM {voucher.amount.toLocaleString()}</strong></span>
                </div>
                <div className="mobileRecordSection">
                  <Typography.Text className="mobileRecordLabel">Purpose / 用途</Typography.Text>
                  <div className="mobileRecordTextBlock"><span>{voucher.purpose}</span></div>
                </div>
                <div className="mobileRecordFooter">
                  <Tag>Issued: {voucher.issuedDate}</Tag>
                  <Button size="small" type="primary" onClick={() => selectPaymentVoucher(voucher.id)}>Details</Button>
                </div>
              </article>
            ))}
          </div>
          <Table className="desktopDataTable" rowKey="id" columns={paymentVoucherTableColumns} dataSource={paymentVouchers} pagination={tablePagination(8)} scroll={{ x: 960 }} />
          <Modal
            title="New Payment Voucher / 新增付款凭证"
            width={620}
            open={financeCreateOpen === "paymentVoucher"}
            onCancel={() => setFinanceCreateOpen(null)}
            footer={null}
            destroyOnClose
            className="recordCreateModal"
          >
          <Form layout="vertical" className="modalForm" onFinish={(values) => {
            const voucher: PaymentVoucher = {
              id: newId(),
              vehicleId: values.vehicleId,
              payeeName: values.payeeName,
              amount: Number(values.amount ?? 0),
              purpose: values.purpose,
              status: values.status,
              issuedDate: values.issuedDate,
              notes: values.notes
            };
            const blockReason = paymentVoucherCreateBlockReason(voucher, vehicles);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreatePaymentVoucher(voucher);
            setFinanceCreateOpen(null);
          }} initialValues={{ vehicleId: vehicles[0]?.id, purpose: "Outstation Pickup Allowance", status: "Pending", issuedDate: today() }}>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="payeeName" label="Payee / 收款人" rules={[{ required: true }]}><Input placeholder="Driver / staff name" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="purpose" label="Purpose / 用途" rules={[{ required: true }]}><Input placeholder="Outstation Pickup Allowance" /></Form.Item>
            <Form.Item name="issuedDate" label="Issued Date / 日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="status" label="Status / 状态"><Select options={["Pending", "Approved", "Paid"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Booking slip / salary voucher reference" /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Voucher</Button></Form.Item>
          </Form>
          </Modal>
        </Space>
      </ProCard>}
      <Drawer
        title="Payment Voucher Details / 付款凭证详情"
        width={560}
        open={financeEditorOpen === "paymentVoucher"}
        onClose={() => setFinanceEditorOpen(null)}
        destroyOnClose
        className="recordEditDrawer"
      >
          <Form
            key={selectedEditPaymentVoucher?.id ?? "payment-voucher-edit"}
            layout="vertical"
            className="drawerForm"
            initialValues={selectedEditPaymentVoucher}
            onFinish={(values) => {
              if (!selectedEditPaymentVoucher) return;
              const voucher: PaymentVoucher = {
                ...selectedEditPaymentVoucher,
                vehicleId: values.vehicleId,
                payeeName: values.payeeName,
                amount: Number(values.amount ?? 0),
                purpose: values.purpose,
                status: values.status,
                issuedDate: values.issuedDate,
                notes: values.notes?.trim() || undefined
              };
              const blockReason = paymentVoucherCreateBlockReason(voucher, vehicles);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }
              onUpdatePaymentVoucher(voucher);
              setFinanceEditorOpen(null);
            }}
          >
            <Form.Item name="id" label="Selected Voucher"><Select options={paymentVouchers.map((voucher) => ({ value: voucher.id, label: `${plateFor(vehicles, voucher.vehicleId)} / ${voucher.payeeName} / RM ${voucher.amount.toLocaleString()}` }))} onChange={selectPaymentVoucher} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="payeeName" label="Payee / 收款人" rules={[{ required: true }]}><Input placeholder="Driver / staff name" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="purpose" label="Purpose / 用途" rules={[{ required: true }]}><Input placeholder="Outstation Pickup Allowance" /></Form.Item>
            <Form.Item name="issuedDate" label="Issued Date / 日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="status" label="Status / 状态"><Select options={["Pending", "Approved", "Paid"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Booking slip / salary voucher reference" /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditPaymentVoucher}>Update Voucher</Button></Form.Item>
          </Form>
      </Drawer>
      {financeTab === "daily" && <ProCard
        id="daily-spend-list-card"
        title="Daily Spend / 日常支出"
        extra={<Button type="primary" onClick={() => setFinanceCreateOpen("dailySpend")}>New Daily Spend</Button>}
      >
        <Space direction="vertical" size={12} className="fullWidth">
          <div className="mobileRecordList">
            {dailySpends.map((spend) => (
              <article className="mobileRecordCard" key={spend.id}>
                <div className="mobileRecordHeader">
                  <div>
                    <Typography.Text className="mobileRecordEyebrow">Description / 项目</Typography.Text>
                    <Typography.Title level={5}>{spend.description}</Typography.Title>
                  </div>
                  <Tag color={spend.isPaid ? "green" : "red"}>{spend.isPaid ? "Paid" : "Due"}</Tag>
                </div>
                <div className="mobileRecordMeta">
                  <span><small>Amount / 金额</small><strong>RM {spend.amount.toLocaleString()}</strong></span>
                  <span><small>Due / 到期</small><strong>{spend.dueDate}</strong></span>
                </div>
                <div className="mobileRecordFooter">
                  <Space className="tableActionGroup" wrap size={6}>
                    <Button size="small" type="primary" onClick={() => selectDailySpend(spend.id)}>Details</Button>
                    <Button size="small" onClick={() => onUpdateDailySpend({ ...spend, isPaid: true })} disabled={spend.isPaid}>Mark Paid</Button>
                    <Button size="small" onClick={() => onUpdateDailySpend({ ...spend, isPaid: false })} disabled={!canReopenPaidDailySpend(spend)}>Reopen</Button>
                  </Space>
                </div>
              </article>
            ))}
          </div>
          <Table className="desktopDataTable" rowKey="id" columns={dailySpendTableColumns} dataSource={dailySpends} pagination={tablePagination(8)} scroll={{ x: 640 }} />
          <Modal
            title="New Daily Spend / 新增日常支出"
            width={560}
            open={financeCreateOpen === "dailySpend"}
            onCancel={() => setFinanceCreateOpen(null)}
            footer={null}
            destroyOnClose
            className="recordCreateModal"
          >
          <Form layout="vertical" className="modalForm" onFinish={(values) => {
            const spend: DailySpend = {
              id: newId(),
              description: values.description,
              amount: Number(values.amount ?? 0),
              dueDate: values.dueDate,
              isPaid: values.isPaid
            };
            const blockReason = dailySpendCreateBlockReason(spend);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreateDailySpend(spend);
            setFinanceCreateOpen(null);
          }} initialValues={{ description: "Electric Bill", dueDate: monthlyElectricBillDueDate(), isPaid: false }}>
            <Form.Item name="description" label="Description / 项目" rules={[{ required: true }]}><Input placeholder="Electric Bill" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="dueDate" label="Due Date / 到期日" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="isPaid" label="Status / 状态"><Select options={[{ value: false, label: "Due" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Daily Spend</Button></Form.Item>
          </Form>
          </Modal>
        </Space>
      </ProCard>}
      <Drawer
        title="Daily Spend Details / 日常支出详情"
        width={560}
        open={financeEditorOpen === "dailySpend"}
        onClose={() => setFinanceEditorOpen(null)}
        destroyOnClose
        className="recordEditDrawer"
      >
          <Form
            key={selectedEditDailySpend?.id ?? "daily-spend-edit"}
            layout="vertical"
            className="drawerForm"
            initialValues={selectedEditDailySpend}
            onFinish={(values) => {
              if (!selectedEditDailySpend) return;
              const spend: DailySpend = {
                ...selectedEditDailySpend,
                description: values.description,
                amount: Number(values.amount ?? 0),
                dueDate: values.dueDate,
                isPaid: values.isPaid
              };
              const blockReason = dailySpendCreateBlockReason(spend);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }
              onUpdateDailySpend(spend);
              setFinanceEditorOpen(null);
            }}
          >
            <Form.Item name="id" label="Selected Daily Spend"><Select options={dailySpends.map((spend) => ({ value: spend.id, label: `${spend.description} / RM ${spend.amount.toLocaleString()} / ${spend.dueDate}` }))} onChange={selectDailySpend} /></Form.Item>
            <Form.Item name="description" label="Description / 项目" rules={[{ required: true }]}><Input placeholder="Electric Bill" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="dueDate" label="Due Date / 到期日" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="isPaid" label="Status / 状态"><Select options={[{ value: false, label: "Due" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditDailySpend}>Update Daily Spend</Button></Form.Item>
          </Form>
      </Drawer>
    </Space>
  );
}


function documentCategoryLabel(category: DocumentCategory) {
  const labels: Record<DocumentCategory, string> = {
    PurchaseInvoice: "Purchase Invoice",
    Voc: "VOC",
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

  return labels[category];
}

function shortformLabel(label: string, title: string) {
  return (
    <Tooltip title={title}>
      <span>{label}</span>
    </Tooltip>
  );
}

function plateFor(vehicles: VehicleLookup[], vehicleId: string) {
  return vehicles.find((vehicle) => vehicle.id === vehicleId)?.plateNumber ?? "Unknown";
}

function customerLabel(customers: Customer[], customerId: string) {
  return customers.find((customer) => customer.id === customerId)?.name ?? "Unknown";
}

function paymentChecklistTags(payment: PaymentRecord) {
  return [
    ["Docs", payment.documentsPrepared, "Documents prepared"],
    ["Checklist", payment.checklistValidated],
    ["Invoice", payment.invoiceGenerated],
    ["AutoCount", payment.autoCountKeyed, "Accounting system entry status"]
  ].map(([label, done, tooltip]) => {
    const tag = <Tag key={String(label)} color={done ? "green" : "orange"}>{String(label)}</Tag>;
    return tooltip ? <Tooltip key={String(label)} title={String(tooltip)}>{tag}</Tooltip> : tag;
  });
}

function contactFor<T extends { id: string; name: string; phone: string }>(contacts: T[], contactId?: string) {
  if (!contactId) return "-";
  const contact = contacts.find((item) => item.id === contactId);
  return contact ? `${contact.name} / ${contact.phone}` : "Unknown";
}

function tablePagination(pageSize = 8): TablePaginationConfig {
  return {
    pageSize,
    showSizeChanger: true,
    pageSizeOptions: ["5", "8", "10", "20", "50"],
    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`
  };
}

function textFilters(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ text: value, value }));
}

function withColumnFilters<T>(columns: ColumnsType<T>, filters: Array<Partial<ColumnsType<T>[number]> & { dataIndex: string }>): ColumnsType<T> {
  return columns.map((column) => {
    const dataIndex = "dataIndex" in column ? column.dataIndex : undefined;
    const filter = filters.find((item) => item.dataIndex === dataIndex);

    return filter ? { ...column, ...filter } : column;
  });
}

function newId() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthlyElectricBillDueDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-15`;
}
