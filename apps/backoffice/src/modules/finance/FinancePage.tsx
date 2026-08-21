import { useEffect, useState } from "react";
import { ProCard } from "@ant-design/pro-components";
import { Alert, Badge, Button, DatePicker, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Pagination, Select, Space, Table, Tabs, Tag, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TablePaginationConfig } from "antd/es/table/interface";
import { CashCustodyPage } from "./CashCustodyPage";
import { FINANCE_LIST_PAGE_SIZE, filterFinanceRows, financePageFor, financeStatusLabel, pageFinanceRows } from "./financeList";
import { OcrUploadReview, type OcrReviewValues } from "../shared/OcrUploadReview";
import { MissingUploadReminder } from "../shared/MissingUploadReminder";
import {
  brokerCommissionCreateBlockReason,
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
  getVehicleDocuments,
  humanizeApiError,
  type BrokerCommission,
  type CashHandover,
  type CashHandoverPaymentLookup,
  type CurrentUser,
  type Customer,
  type DailySpend,
  type DebtRecoveryCase,
  type DocumentCategory,
  type Owner,
  type PaymentRecord,
  type PaymentVoucher,
  type SettlementReminder,
  type VehicleDocument,
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
  currentUser,
  cashHandovers,
  cashHandoverPaymentLookup,
  onCreate,
  onUpdate,
  onApproveManagementReview,
  onOpenCustomer,
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
  onExportPayments,
  onUploadDocument: _onUploadDocument,
  onCreateCashHandover,
  onRequestCashHandover,
  onRecordCashHandover,
  onAcceptCashHandover,
  onRejectCashHandover
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
  currentUser: CurrentUser | null;
  cashHandovers: CashHandover[];
  cashHandoverPaymentLookup: CashHandoverPaymentLookup[];
  onCreate: (payment: PaymentRecord) => void;
  onUpdate: (payment: PaymentRecord) => void;
  onApproveManagementReview: (paymentId: string) => Promise<void>;
  onOpenCustomer: (customerId: string) => void;
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
  onExportPayments: () => Promise<string>;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
  onCreateCashHandover: (paymentRecordId: string, amount: number, notes?: string) => Promise<void>;
  onRequestCashHandover: (id: string) => Promise<void>;
  onRecordCashHandover: (id: string) => Promise<void>;
  onAcceptCashHandover: (id: string) => Promise<void>;
  onRejectCashHandover: (id: string, reason: string) => Promise<void>;
}) {
  const canManageFinance = !currentUser?.isAuthenticated || currentUser.roles.some((role) => role === "BossAdmin" || role === "Finance");
  const canApproveManagementReview = Boolean(currentUser?.roles.includes("BossAdmin"));
  const eligiblePaymentVehicles = vehicles.filter((vehicle) => Boolean(vehicle.customerId));
  const [uploadPaymentId, setUploadPaymentId] = useState(payments[0]?.id ?? "");
  const [editPaymentId, setEditPaymentId] = useState(payments[0]?.id ?? "");
  const [editSettlementId, setEditSettlementId] = useState(settlements[0]?.id ?? "");
  const [editDailySpendId, setEditDailySpendId] = useState(dailySpends[0]?.id ?? "");
  const [editBrokerCommissionId, setEditBrokerCommissionId] = useState(brokerCommissions[0]?.id ?? "");
  const [editDebtRecoveryId, setEditDebtRecoveryId] = useState(debtRecoveries[0]?.id ?? "");
  const [editPaymentVoucherId, setEditPaymentVoucherId] = useState(paymentVouchers[0]?.id ?? "");
  const [financeEditorOpen, setFinanceEditorOpen] = useState<"payment" | "settlement" | "dailySpend" | "brokerCommission" | "debtRecovery" | "paymentVoucher" | null>(null);
  const [financeCreateOpen, setFinanceCreateOpen] = useState<"payment" | "settlement" | "dailySpend" | "brokerCommission" | "debtRecovery" | "paymentVoucher" | null>(null);
  const [financeTab, setFinanceTab] = useState(() => financeTabFromLocation(canManageFinance));
  const [financeKeyword, setFinanceKeyword] = useState("");
  const [financeStatus, setFinanceStatus] = useState<string>();
  const [financePage, setFinancePage] = useState(1);
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>("PaymentReceipt");
  const [documentReloadKey, setDocumentReloadKey] = useState(0);
  const [paymentDocuments, setPaymentDocuments] = useState<VehicleDocument[]>([]);
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
    const syncFinanceTabFromLocation = () => setFinanceTab(financeTabFromLocation(canManageFinance));
    syncFinanceTabFromLocation();
    window.addEventListener("popstate", syncFinanceTabFromLocation);
    return () => window.removeEventListener("popstate", syncFinanceTabFromLocation);
  }, [canManageFinance]);

  const changeFinanceTab = (nextTab: string) => {
    setFinanceTab(nextTab);
    setFinanceKeyword("");
    setFinanceStatus(undefined);
    setFinancePage(1);
    const nextUrl = `/finance?tab=${encodeURIComponent(nextTab)}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.pushState(null, "", nextUrl);
    }
  };

  useEffect(() => {
    setFinanceKeyword("");
    setFinanceStatus(undefined);
    setFinancePage(1);
  }, [financeTab]);

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

  useEffect(() => {
    let active = true;
    if (!selectedPayment) {
      setPaymentDocuments([]);
      return () => {
        active = false;
      };
    }

    void getVehicleDocuments(selectedPayment.vehicleId).then((documents) => {
      if (active) setPaymentDocuments(documents.filter((document) => document.paymentRecordId === selectedPayment.id));
    });

    return () => {
      active = false;
    };
  }, [documentReloadKey, selectedPayment?.id, selectedPayment?.vehicleId]);

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

  const handleExportPayments = async () => {
    try {
      const csv = await onExportPayments();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bank-collection-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      message.success("Bank collection spreadsheet exported for manual AutoCount submission");
    } catch (error) {
      message.error(humanizeApiError(error, "Bank collection export failed. Please try again."));
    }
  };

  const columns: ColumnsType<PaymentRecord> = [
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Collection / 收款", dataIndex: "nettPrice", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Reconciled" ? "green" : "orange"}>{status}</Tag> },
    {
      title: "Reference / 单据",
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{row.receiptNumber || "No receipt"}</Typography.Text>
          <Typography.Text type="secondary">{row.invoiceNumber || "No invoice"}</Typography.Text>
        </Space>
      )
    },
    {
      title: "Bank Follow-up / 银行跟进",
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{row.bankName || "-"}</Typography.Text>
          <Typography.Text type="secondary">{row.bankFollowUpDate || "No follow-up"}</Typography.Text>
        </Space>
      )
    },
    {
      title: "Ready / 准备",
      render: (_, row) => (
        <Space wrap size={4}>
          <Tag color={row.bossChecked ? "green" : "orange"}>{row.bossChecked ? "Reviewed" : "Review pending"}</Tag>
          {paymentChecklistReady(row) ? <Tag color="green">Checklist done</Tag> : <Tag color="gold">Checklist pending</Tag>}
        </Space>
      )
    },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 190,
      render: (_, row) => {
        const reconcileReason = paymentReconcileBlockReason(row, payments);
        return (
          <Space className="tableActionGroup" wrap size={6}>
            <Button size="small" type="primary" onClick={() => selectPayment(row.id)}>Details</Button>
            {canApproveManagementReview && !row.bossChecked && <Button size="small" onClick={() => onApproveManagementReview(row.id)}>Approve review</Button>}
            <Tooltip title={reconcileReason ?? ""}>
              <span>
                <Button size="small" onClick={() => onUpdate({ ...row, status: "Reconciled" })} disabled={!canReconcilePayment(row, payments)}>Reconcile</Button>
              </span>
            </Tooltip>
          </Space>
        );
      }
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
        </Space>
      )
    }
  ];
  const debtRecoveryColumns: ColumnsType<DebtRecoveryCase> = [
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Customer / 客户", dataIndex: "customerId", render: (customerId) => customerLabel(customers, customerId) },
    { title: "Balance / 欠款", dataIndex: "balanceAmount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Follow Up / 跟进", dataIndex: "followUpDate" },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Closed" ? "green" : status === "FollowedUp" ? "blue" : "orange"}>{financeStatusLabel(status)}</Tag> },
    { title: "Notes / 备注", dataIndex: "notes", render: (value) => value || "-" },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 290,
      render: (_, row) => (
        <Space className="tableActionGroup" wrap size={6}>
          <Button size="small" type="primary" onClick={() => selectDebtRecovery(row.id)}>Details</Button>
          <Button size="small" onClick={() => onOpenCustomer(row.customerId)}>Customer 360</Button>
          {row.status === "Open" ? (
            <Button size="small" onClick={() => onUpdateDebtRecovery({ ...row, status: "FollowedUp" })}>Followed</Button>
          ) : (
            <Button size="small" onClick={() => onUpdateDebtRecovery({ ...row, status: "Closed" })} disabled={row.status === "Closed"}>Close</Button>
          )}
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
          {row.status === "Pending" ? (
            <Button size="small" onClick={() => onUpdatePaymentVoucher({ ...row, status: "Approved" })}>Approve</Button>
          ) : (
            <Button size="small" onClick={() => onUpdatePaymentVoucher({ ...row, status: "Paid" })} disabled={row.status === "Paid"}>Paid</Button>
          )}
        </Space>
      )
    }
  ];
  const filteredPayments = filterFinanceRows(payments, financeKeyword, financeStatus, (payment) => [
    plateFor(vehicles, payment.vehicleId), payment.receiptNumber, payment.invoiceNumber, payment.bankName, payment.bankFollowUpDate
  ], (payment) => payment.status);
  const filteredSettlements = filterFinanceRows(settlements, financeKeyword, financeStatus, (settlement) => [
    plateFor(vehicles, settlement.vehicleId), contactFor(owners, settlement.ownerId), settlement.deadline
  ], (settlement) => settlement.isPaid ? "Paid" : "Due");
  const filteredDailySpends = filterFinanceRows(dailySpends, financeKeyword, financeStatus, (spend) => [spend.description, spend.dueDate], (spend) => spend.isPaid ? "Paid" : "Due");
  const filteredBrokerCommissions = filterFinanceRows(brokerCommissions, financeKeyword, financeStatus, (commission) => [
    plateFor(vehicles, commission.vehicleId), commission.brokerName
  ], (commission) => commission.isPaid ? "Paid" : "Unpaid");
  const filteredDebtRecoveries = filterFinanceRows(debtRecoveries, financeKeyword, financeStatus, (debt) => [
    plateFor(vehicles, debt.vehicleId), customerLabel(customers, debt.customerId), debt.followUpDate, debt.notes
  ], (debt) => debt.status);
  const filteredPaymentVouchers = filterFinanceRows(paymentVouchers, financeKeyword, financeStatus, (voucher) => [
    plateFor(vehicles, voucher.vehicleId), voucher.payeeName, voucher.purpose, voucher.issuedDate, voucher.notes
  ], (voucher) => voucher.status);
  const financeStatusOptions = statusOptionsForFinanceTab(financeTab);
  const activeFinanceList = financeTab === "settlements"
    ? { filtered: filteredSettlements.length, total: settlements.length }
    : financeTab === "commissions"
      ? { filtered: filteredBrokerCommissions.length, total: brokerCommissions.length }
      : financeTab === "debt"
        ? { filtered: filteredDebtRecoveries.length, total: debtRecoveries.length }
        : financeTab === "vouchers"
          ? { filtered: filteredPaymentVouchers.length, total: paymentVouchers.length }
          : financeTab === "daily"
            ? { filtered: filteredDailySpends.length, total: dailySpends.length }
            : { filtered: filteredPayments.length, total: payments.length };
  const financeFiltersActive = Boolean(financeKeyword.trim() || financeStatus);
  const financeFilters = (
    <Space wrap className="toolbarForm">
      <Input.Search
        allowClear
        aria-label="Filter finance records by keyword"
        placeholder="Search current list"
        value={financeKeyword}
        onChange={(event) => {
          setFinanceKeyword(event.target.value);
          setFinancePage(1);
        }}
      />
      <Select
        allowClear
        aria-label="Filter finance records by status"
        className="financeStatusFilter"
        options={financeStatusOptions}
        placeholder="All statuses"
        value={financeStatus}
        onChange={(value) => {
          setFinanceStatus(value);
          setFinancePage(1);
        }}
      />
      <Tag color={financeFiltersActive ? "blue" : undefined}>{financeFiltersActive ? `${activeFinanceList.filtered} of ${activeFinanceList.total} matching` : `${activeFinanceList.total} record${activeFinanceList.total === 1 ? "" : "s"}`}</Tag>
      {financeFiltersActive && <Button
        onClick={() => {
          setFinanceKeyword("");
          setFinanceStatus(undefined);
          setFinancePage(1);
        }}
      >
        Clear filters
      </Button>}
    </Space>
  );
  const paymentPage = financePageFor(filteredPayments.length, financePage);
  const settlementPage = financePageFor(filteredSettlements.length, financePage);
  const dailySpendPage = financePageFor(filteredDailySpends.length, financePage);
  const brokerCommissionPage = financePageFor(filteredBrokerCommissions.length, financePage);
  const debtRecoveryPage = financePageFor(filteredDebtRecoveries.length, financePage);
  const paymentVoucherPage = financePageFor(filteredPaymentVouchers.length, financePage);
  const visiblePayments = pageFinanceRows(filteredPayments, paymentPage);
  const visibleSettlements = pageFinanceRows(filteredSettlements, settlementPage);
  const visibleDailySpends = pageFinanceRows(filteredDailySpends, dailySpendPage);
  const visibleBrokerCommissions = pageFinanceRows(filteredBrokerCommissions, brokerCommissionPage);
  const visibleDebtRecoveries = pageFinanceRows(filteredDebtRecoveries, debtRecoveryPage);
  const visiblePaymentVouchers = pageFinanceRows(filteredPaymentVouchers, paymentVoucherPage);
  const paymentEmptyText = financeEmptyText(payments.length, filteredPayments.length, "bank collection records");
  const settlementEmptyText = financeEmptyText(settlements.length, filteredSettlements.length, "settlement reminders");
  const dailySpendEmptyText = financeEmptyText(dailySpends.length, filteredDailySpends.length, "daily spend records");
  const brokerCommissionEmptyText = financeEmptyText(brokerCommissions.length, filteredBrokerCommissions.length, "broker commissions");
  const debtRecoveryEmptyText = financeEmptyText(debtRecoveries.length, filteredDebtRecoveries.length, "debt recovery cases");
  const paymentVoucherEmptyText = financeEmptyText(paymentVouchers.length, filteredPaymentVouchers.length, "payment vouchers");
  const outstanding = payments.filter((payment) => payment.status !== "Reconciled").reduce((sum, payment) => sum + payment.nettPrice, 0);
  const settlementOutstanding = settlements.filter((settlement) => !settlement.isPaid).reduce((sum, settlement) => sum + settlement.amount, 0);
  const dailySpendOutstanding = dailySpends.filter((spend) => !spend.isPaid).reduce((sum, spend) => sum + spend.amount, 0);
  const brokerCommissionOutstanding = brokerCommissions.filter((commission) => !commission.isPaid).reduce((sum, commission) => sum + commission.amount, 0);
  const debtOutstanding = debtRecoveries.filter((debt) => debt.status !== "Closed").reduce((sum, debt) => sum + debt.balanceAmount, 0);
  const voucherOutstanding = paymentVouchers.filter((voucher) => voucher.status !== "Paid").reduce((sum, voucher) => sum + voucher.amount, 0);
  const activeFinanceSummary = (() => {
    switch (financeTab) {
      case "cash-custody":
        return [
          { label: "Open custody", value: cashHandovers.filter((handover) => handover.status !== "Receipted" && handover.status !== "Rejected").length },
          { label: "Receipts", value: cashHandovers.filter((handover) => Boolean(handover.officialReceiptId)).length },
          { label: "Cash value", value: `RM ${cashHandovers.reduce((total, handover) => total + handover.amount, 0).toLocaleString()}` }
        ];
      case "settlements":
        return [
          { label: "Rows", value: settlements.length },
          { label: "Due", value: settlements.filter((settlement) => !settlement.isPaid).length },
          { label: "Outstanding", value: `RM ${settlementOutstanding.toLocaleString()}` }
        ];
      case "commissions":
        return [
          { label: "Rows", value: brokerCommissions.length },
          { label: "Unpaid", value: brokerCommissions.filter((commission) => !commission.isPaid).length },
          { label: "Outstanding", value: `RM ${brokerCommissionOutstanding.toLocaleString()}` }
        ];
      case "debt":
        return [
          { label: "Cases", value: debtRecoveries.length },
          { label: "Open", value: debtRecoveries.filter((debt) => debt.status !== "Closed").length },
          { label: "Balance", value: `RM ${debtOutstanding.toLocaleString()}` }
        ];
      case "vouchers":
        return [
          { label: "Rows", value: paymentVouchers.length },
          { label: "Open", value: paymentVouchers.filter((voucher) => voucher.status !== "Paid").length },
          { label: "Amount", value: `RM ${voucherOutstanding.toLocaleString()}` }
        ];
      case "daily":
        return [
          { label: "Rows", value: dailySpends.length },
          { label: "Due", value: dailySpends.filter((spend) => !spend.isPaid).length },
          { label: "Amount", value: `RM ${dailySpendOutstanding.toLocaleString()}` }
        ];
      default:
        return [
          { label: "Rows", value: payments.length },
          { label: "Open bank", value: payments.filter((payment) => payment.status !== "Reconciled").length },
          { label: "Outstanding", value: `RM ${outstanding.toLocaleString()}` }
        ];
    }
  })();

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard>
        <Tabs
          activeKey={financeTab}
          onChange={changeFinanceTab}
          items={[
            ...(canManageFinance ? [
              { key: "payments", label: "Bank Collection / 收款Bank" },
              { key: "settlements", label: "Settlement / 结算" },
              { key: "commissions", label: "Broker Commission / 经纪佣金" },
              { key: "debt", label: "Debt Recovery / 欠款追讨" },
              { key: "vouchers", label: "Payment Voucher / 付款凭证" },
              { key: "daily", label: "Daily Spend / 日常支出" }
            ] : []),
            { key: "cash-custody", label: "Cash Handover / Official Receipts" }
          ]}
        />
        <div className="financeSummaryStrip">
          {activeFinanceSummary.map((item) => (
            <span key={item.label}>
              <strong>{item.value}</strong>
              {item.label}
            </span>
          ))}
        </div>
      </ProCard>
      {financeTab === "cash-custody" && (
        <CashCustodyPage
          currentUser={currentUser}
          customers={customers}
          handovers={cashHandovers}
          paymentLookup={cashHandoverPaymentLookup}
          onCreate={onCreateCashHandover}
          onRequestHandover={onRequestCashHandover}
          onRecordHandover={onRecordCashHandover}
          onAccept={onAcceptCashHandover}
          onReject={onRejectCashHandover}
        />
      )}
      {financeTab === "payments" && <ProCard
        title="Bank Collection / 收款Bank"
        extra={<Space wrap><Button onClick={handleExportPayments}>Export Spreadsheet (CSV)</Button><Button type="primary" disabled={eligiblePaymentVehicles.length === 0} onClick={() => setFinanceCreateOpen("payment")}>New Bank Collection</Button></Space>}
      >
        <Space direction="vertical" size={12} className="fullWidth">
          {financeFilters}
          {eligiblePaymentVehicles.length === 0 && <Alert type="warning" showIcon message="Link a confirmed buyer to a vehicle before recording a collection." />}
          <div className="mobileRecordList">
          {filteredPayments.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={paymentEmptyText} />}
          {visiblePayments.map((payment) => {
            return (
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
                  {canApproveManagementReview && !payment.bossChecked && <Button size="small" onClick={() => onApproveManagementReview(payment.id)}>Approve review</Button>}
                  <Tooltip title={paymentReconcileBlockReason(payment, payments) ?? ""}>
                    <span>
                      <Button size="small" onClick={() => onUpdate({ ...payment, status: "Reconciled" })} disabled={!canReconcilePayment(payment, payments)}>Reconcile</Button>
                    </span>
                  </Tooltip>
                </Space>
              </div>
            </article>
            );
          })}
          <Pagination className="mobileRecordPagination" current={paymentPage} pageSize={FINANCE_LIST_PAGE_SIZE} total={filteredPayments.length} showSizeChanger={false} hideOnSinglePage onChange={setFinancePage} />
          </div>
          <Table className="desktopDataTable" rowKey="id" columns={columns} dataSource={filteredPayments} pagination={tablePagination(filteredPayments.length, paymentPage, setFinancePage)} scroll={{ x: 960 }} locale={{ emptyText: paymentEmptyText }} />
        </Space>
      </ProCard>}
      <Modal
        title="New Bank Collection / 新增收款"
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
            status: "Pending",
            receiptNumber: values.receiptNumber?.trim() || undefined,
            invoiceNumber: values.invoiceNumber?.trim() || undefined,
            bossChecked: false,
            documentsPrepared: false,
            checklistValidated: false,
            salesPrice: 0,
            interestAdditionalCharges: 0,
            ncdAmount: 0,
            windscreenCharges: 0,
            bankName: values.bankName?.trim() || undefined,
            bankFollowUpDate: values.bankFollowUpDate?.format("YYYY-MM-DD"),
            createdAt: new Date().toISOString()
          };
          const blockReason = paymentCreateBlockReason(payment, payments);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }
          onCreate(payment);
          setFinanceCreateOpen(null);
        }} initialValues={{ vehicleId: eligiblePaymentVehicles[0]?.id }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={eligiblePaymentVehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="nettPrice" label="Collection Amount / Nett Price" rules={[{ required: true, message: "Collection amount is required." }]}><InputNumber className="fullWidth" min={0.01} /></Form.Item>
          <Form.Item name="bankName" label="Bank"><Input placeholder="Maybank" /></Form.Item>
          <Form.Item name="bankFollowUpDate" label="Bank Follow-up"><DatePicker className="fullWidth" /></Form.Item>
          <Form.Item name="receiptNumber" label="Receipt No."><Input placeholder="RCPT-1001" /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice No."><Input placeholder="INV-1001" /></Form.Item>
          <Alert type="info" showIcon message="Collection starts as Pending. Export the spreadsheet and submit it manually to AutoCount; use row actions for disbursement, management review, checklist, and reconciliation." />
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Collection</Button></Form.Item>
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
            bossChecked: false,
            documentsPrepared: values.documentsPrepared,
            checklistValidated: values.checklistValidated,
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
        }} initialValues={{ vehicleId: vehicles[0]?.id, status: "Pending", bossChecked: false, documentsPrepared: false, checklistValidated: false }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="nettPrice" label="Nett Price"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Pending", "Approved", "Disbursed", "Reconciled"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="receiptNumber" label="Receipt No."><Input placeholder="RCPT-1001" /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice No."><Input placeholder="INV-1001" /></Form.Item>
          <Form.Item name="documentsPrepared" label="Prepare Document"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="checklistValidated" label="Checklist Validation"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
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
              documentsPrepared: values.documentsPrepared,
              checklistValidated: values.checklistValidated,
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
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.filter((vehicle) => vehicle.customerId || vehicle.id === selectedEditPayment?.vehicleId).map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="nettPrice" label="Nett Price"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Pending", "Approved", "Disbursed", "Reconciled"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="receiptNumber" label="Receipt No."><Input placeholder="RCPT-1001" /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice No."><Input placeholder="INV-1001" /></Form.Item>
          <Descriptions size="small" column={1} className="fullWidth">
            <Descriptions.Item label="Management Review / 管理层审核">{selectedEditPayment?.bossChecked ? "Reviewed" : "Pending"}</Descriptions.Item>
          </Descriptions>
          {canApproveManagementReview && selectedEditPayment && !selectedEditPayment.bossChecked && <Button onClick={() => onApproveManagementReview(selectedEditPayment.id)}>Approve Management Review</Button>}
          <Form.Item name="documentsPrepared" label="Prepare Document"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="checklistValidated" label="Checklist Validation"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
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
          <MissingUploadReminder
            title="Payment evidence required"
            description="Attach the receipt or invoice to this collection record before finance reconciliation."
            items={financeDocumentCategories.map((category) => ({
              label: documentCategoryLabel(category),
              isPresent: paymentDocuments.some((document) => document.category === category)
            }))}
            onAction={() => setDocumentCategory(financeDocumentCategories.find((category) => !paymentDocuments.some((document) => document.category === category)) ?? "PaymentReceipt")}
          />
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
                uploadOwner={selectedPayment ? { paymentRecordId: selectedPayment.id } : undefined}
                buttonLabel="Add receipt or invoice photo"
                applyLabel="Use details in payment"
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
                onUploaded={() => setDocumentReloadKey((value) => value + 1)}
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
          {financeFilters}
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Deadline Popup">Admin receives reminder when settlement deadline is due.</Descriptions.Item>
            <Descriptions.Item label="Bank collection export">Export a spreadsheet for staff to submit manually in AutoCount.</Descriptions.Item>
            <Descriptions.Item label="Outstanding Bank Collection">RM {outstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Outstanding Settlement">RM {settlementOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Daily Spend Due">RM {dailySpendOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Broker Commission Due">RM {brokerCommissionOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Debt Recovery Balance">RM {debtOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Payment Voucher Open">RM {voucherOutstanding.toLocaleString()}</Descriptions.Item>
          </Descriptions>
          <div className="mobileRecordList">
            {filteredSettlements.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={settlementEmptyText} />}
            {visibleSettlements.map((settlement) => (
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
            <Pagination className="mobileRecordPagination" current={settlementPage} pageSize={FINANCE_LIST_PAGE_SIZE} total={filteredSettlements.length} showSizeChanger={false} hideOnSinglePage onChange={setFinancePage} />
          </div>
          <Table className="desktopDataTable" rowKey="id" columns={settlementColumns} dataSource={filteredSettlements} pagination={tablePagination(filteredSettlements.length, settlementPage, setFinancePage)} scroll={{ x: 640 }} locale={{ emptyText: settlementEmptyText }} />
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
          {financeFilters}
          <div className="mobileRecordList">
            {filteredBrokerCommissions.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={brokerCommissionEmptyText} />}
            {visibleBrokerCommissions.map((commission) => (
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
            <Pagination className="mobileRecordPagination" current={brokerCommissionPage} pageSize={FINANCE_LIST_PAGE_SIZE} total={filteredBrokerCommissions.length} showSizeChanger={false} hideOnSinglePage onChange={setFinancePage} />
          </div>
          <Table className="desktopDataTable" rowKey="id" columns={brokerCommissionColumns} dataSource={filteredBrokerCommissions} pagination={tablePagination(filteredBrokerCommissions.length, brokerCommissionPage, setFinancePage)} scroll={{ x: 760 }} locale={{ emptyText: brokerCommissionEmptyText }} />
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
          {financeFilters}
          <div className="mobileRecordList">
            {filteredDebtRecoveries.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={debtRecoveryEmptyText} />}
            {visibleDebtRecoveries.map((debt) => (
              <article className="mobileRecordCard" key={debt.id}>
                <div className="mobileRecordHeader">
                  <div>
                    <Typography.Text className="mobileRecordEyebrow">Car Plate / 车牌</Typography.Text>
                    <Typography.Title level={5}>{plateFor(vehicles, debt.vehicleId)}</Typography.Title>
                  </div>
                  <Tag color={debt.status === "Closed" ? "green" : debt.status === "FollowedUp" ? "blue" : "orange"}>{financeStatusLabel(debt.status)}</Tag>
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
            <Pagination className="mobileRecordPagination" current={debtRecoveryPage} pageSize={FINANCE_LIST_PAGE_SIZE} total={filteredDebtRecoveries.length} showSizeChanger={false} hideOnSinglePage onChange={setFinancePage} />
          </div>
          <Table className="desktopDataTable" rowKey="id" columns={debtRecoveryColumns} dataSource={filteredDebtRecoveries} pagination={tablePagination(filteredDebtRecoveries.length, debtRecoveryPage, setFinancePage)} scroll={{ x: 960 }} locale={{ emptyText: debtRecoveryEmptyText }} />
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
          {financeFilters}
          <div className="mobileRecordList">
            {filteredPaymentVouchers.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={paymentVoucherEmptyText} />}
            {visiblePaymentVouchers.map((voucher) => (
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
            <Pagination className="mobileRecordPagination" current={paymentVoucherPage} pageSize={FINANCE_LIST_PAGE_SIZE} total={filteredPaymentVouchers.length} showSizeChanger={false} hideOnSinglePage onChange={setFinancePage} />
          </div>
          <Table className="desktopDataTable" rowKey="id" columns={paymentVoucherColumns} dataSource={filteredPaymentVouchers} pagination={tablePagination(filteredPaymentVouchers.length, paymentVoucherPage, setFinancePage)} scroll={{ x: 960 }} locale={{ emptyText: paymentVoucherEmptyText }} />
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
          {financeFilters}
          <div className="mobileRecordList">
            {filteredDailySpends.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={dailySpendEmptyText} />}
            {visibleDailySpends.map((spend) => (
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
            <Pagination className="mobileRecordPagination" current={dailySpendPage} pageSize={FINANCE_LIST_PAGE_SIZE} total={filteredDailySpends.length} showSizeChanger={false} hideOnSinglePage onChange={setFinancePage} />
          </div>
          <Table className="desktopDataTable" rowKey="id" columns={dailySpendColumns} dataSource={filteredDailySpends} pagination={tablePagination(filteredDailySpends.length, dailySpendPage, setFinancePage)} scroll={{ x: 640 }} locale={{ emptyText: dailySpendEmptyText }} />
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

  return labels[category];
}

function shortformLabel(label: string, title: string) {
  return (
    <Tooltip title={title}>
      <span>{label}</span>
    </Tooltip>
  );
}

function financeTabFromLocation(canManageFinance: boolean) {
  if (typeof window === "undefined") return canManageFinance ? "payments" : "cash-custody";
  return financeTabForUrl(window.location.pathname, window.location.search, canManageFinance);
}

export function financeTabForUrl(pathname: string, search: string, canManageFinance: boolean) {
  if (pathname === "/cash-custody") return "cash-custody";
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "cash-custody") return "cash-custody";
  if (!canManageFinance) return "cash-custody";
  return ["payments", "settlements", "commissions", "debt", "vouchers", "daily"].includes(tab ?? "") ? tab ?? "payments" : "payments";
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
    ["Checklist", payment.checklistValidated]
  ].map(([label, done, tooltip]) => {
    const tag = <Tag key={String(label)} color={done ? "green" : "orange"}>{String(label)}</Tag>;
    return tooltip ? <Tooltip key={String(label)} title={String(tooltip)}>{tag}</Tooltip> : tag;
  });
}

function paymentChecklistReady(payment: PaymentRecord) {
  return payment.documentsPrepared && payment.checklistValidated;
}

function contactFor<T extends { id: string; name: string; phone: string }>(contacts: T[], contactId?: string) {
  if (!contactId) return "-";
  const contact = contacts.find((item) => item.id === contactId);
  return contact ? `${contact.name} / ${contact.phone}` : "Unknown";
}

function tablePagination(total: number, current: number, onChange: (page: number) => void): TablePaginationConfig {
  return {
    current,
    pageSize: FINANCE_LIST_PAGE_SIZE,
    total,
    showSizeChanger: false,
    onChange,
    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`
  };
}

function financeEmptyText(totalRows: number, filteredRows: number, itemName: string) {
  return totalRows === 0
    ? `No ${itemName} yet.`
    : filteredRows === 0
      ? `No ${itemName} match the current filters.`
      : `No ${itemName} yet.`;
}

function statusOptionsForFinanceTab(tab: string) {
  const labels = tab === "payments"
    ? ["Pending", "Approved", "Disbursed", "Reconciled"]
    : tab === "settlements" || tab === "daily"
      ? ["Due", "Paid"]
      : tab === "commissions"
        ? ["Unpaid", "Paid"]
        : tab === "debt"
          ? ["Open", "FollowedUp", "Closed"]
          : tab === "vouchers"
            ? ["Pending", "Approved", "Paid"]
            : [];

  return labels.map((value) => ({ label: financeStatusLabel(value), value }));
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
