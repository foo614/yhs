import { useCallback, useEffect, useState } from "react";
import { ProCard } from "@ant-design/pro-components";
import { Alert, Badge, Button, Checkbox, DatePicker, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Pagination, Select, Space, Tabs, Tag, Tooltip, Typography, Upload, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import type { ColumnsType } from "antd/es/table";
import type { TablePaginationConfig } from "antd/es/table/interface";
import { CashCustodyPage } from "./CashCustodyPage";
import { FINANCE_LIST_PAGE_SIZE, filterFinanceRows, financeEmptyText, financePageFor, financeStatusLabel, pageFinanceRows } from "./financeList";
import { singaporeTodayIsoDate, type DashboardDrilldown } from "../../dashboard";
import { OcrUploadReview, type OcrReviewValues } from "../shared/OcrUploadReview";
import { MissingUploadReminder } from "../shared/MissingUploadReminder";
import { OperationsProTable } from "../shared/OperationsProTable";
import { formatMoney, formatMoneyInput, parseMoneyInput } from "../../money";
import {
  brokerCommissionCreateBlockReason,
  calculateFinanceNettPrice,
  canReconcilePayment,
  canReopenPaidDailySpend,
  canReopenPaidSettlement,
  collectionCreateBlockReason,
  dailySpendCreateBlockReason,
  debtRecoveryCreateBlockReason,
  financeDocumentCategories,
  financeSaleBlockReason,
  isFinanceV2,
  paymentCreateBlockReason,
  paymentReconcileBlockReason,
  paymentVoucherCreateBlockReason,
  receivableStatusColor,
  receivableStatusLabel,
  settlementCreateBlockReason
} from "../../finance";
import {
  customerSelectLabel,
  financeInvoiceContentUrl,
  getDeliveryInvoiceUpdateRequests,
  getVehicleDocumentsStrict,
  humanizeApiError,
  paymentVoucherPdfUrl,
  resolveDeliveryInvoiceUpdate,
  vehicleDocumentContentUrl,
  type BrokerCommission,
  type CashHandover,
  type CashHandoverPaymentLookup,
  type CollectionCreateInput,
  type CollectionMethod,
  type CollectionTransaction,
  type CurrentUser,
  type Customer,
  type DailySpend,
  type DebtRecoveryCase,
  type DeliveryInvoiceUpdateRequestItem,
  type DocumentCategory,
  type DocumentUploadOwner,
  type FinanceSaleInput,
  type FinancingStatus,
  type Owner,
  type PaymentRecord,
  type PaymentVoucher,
  type PurchaseInvoice,
  type SettlementReminder,
  type StaffUser,
  type Supplier,
  type VehicleDocument,
  type VehicleLookup
} from "../../api";

export function dailySpendMatchesDashboardAttention(spend: Pick<DailySpend, "isPaid" | "dueDate">, attention: DashboardDrilldown["attention"], today = singaporeTodayIsoDate()) {
  if (attention === "open") return !spend.isPaid;
  if (attention === "due") return !spend.isPaid && spend.dueDate <= today;
  if (attention === "dueSoon") return !spend.isPaid && spend.dueDate > today && spend.dueDate <= addCalendarDays(today, 10);
  return true;
}

export function settlementMatchesDashboardAttention(settlement: Pick<SettlementReminder, "isPaid" | "deadline">, attention: DashboardDrilldown["attention"], today = singaporeTodayIsoDate()) {
  if (attention === "open") return !settlement.isPaid;
  if (attention === "due") return !settlement.isPaid && settlement.deadline <= today;
  return true;
}

export function financeInvoiceVehicleDefaults(vehicle: Pick<VehicleLookup, "sellingPrice" | "additionalCharges">) {
  return {
    salesPrice: vehicle.sellingPrice ?? 0,
    interestAdditionalCharges: vehicle.additionalCharges ?? 0,
    ncdAmount: 0,
    windscreenCharges: 0,
    nettPrice: undefined,
    nettPriceOverrideReason: undefined
  };
}

export function canPrepareFinanceInvoice(paymentLoadError: string | null, vehiclePriceLoadError: string | null, eligibleVehicleCount: number) {
  return !paymentLoadError && !vehiclePriceLoadError && eligibleVehicleCount > 0;
}

export function createUnpaidDailySpend(id: string, description: string, amount: number, dueDate: string): DailySpend {
  return { id, description, amount, dueDate, isPaid: false };
}

export function payDailySpend(spend: DailySpend): DailySpend {
  return { ...spend, isPaid: true };
}

export function financeInvoiceSubmitLabel(calculatedTotal: number, agreedTotal: number | null | undefined, adjusting: boolean) {
  const hasVariance = adjusting && agreedTotal !== null && agreedTotal !== undefined && Math.round(Number(agreedTotal) * 100) !== Math.round(calculatedTotal * 100);
  return hasVariance ? "Review & send for approval" : "Review & generate invoice";
}

export function financeRequesterLabel(requestedBy?: string, currentUserId?: string) {
  if (!requestedBy) return "-";
  return requestedBy === currentUserId ? "You" : "Finance staff";
}

export function financeSearchCopy(tab: string) {
  switch (tab) {
    case "settlements":
      return { placeholder: "Search plate, owner or deadline", ariaLabel: "Search settlements by plate, owner, or deadline" };
    case "commissions":
      return { placeholder: "Search plate or broker", ariaLabel: "Search broker commissions by plate or broker" };
    case "debt":
      return { placeholder: "Search plate, customer, date or notes", ariaLabel: "Search debt recovery by plate, customer, follow-up date, or notes" };
    case "vouchers":
      return { placeholder: "Search plate, payee, purpose or notes", ariaLabel: "Search payment vouchers by plate, payee, purpose, date, or notes" };
    case "daily":
      return { placeholder: "Search description or due date", ariaLabel: "Search daily spend by description or due date" };
    default:
      return { placeholder: "Search plate, customer, invoice or reference", ariaLabel: "Search invoices and collections by plate, customer, invoice, or reference" };
  }
}

type CollectionFormValues = Omit<CollectionCreateInput, "receivedDate" | "idempotencyKey"> & { receivedDate?: Dayjs };

export function InvoiceUpdateRequestQueue({
  requests,
  loading,
  error,
  resolvingId,
  onRetry,
  onResolve
}: {
  requests: DeliveryInvoiceUpdateRequestItem[];
  loading: boolean;
  error?: string;
  resolvingId?: string;
  onRetry: () => void;
  onResolve: (requestItem: DeliveryInvoiceUpdateRequestItem) => void;
}) {
  return (
    <ProCard
      title="Delivery invoice update requests / 交车发票更新"
      extra={<Tag color={requests.length > 0 ? "orange" : "green"}>{requests.length} open</Tag>}
      loading={loading}
      className="financeInvoiceRequestQueue"
    >
      {error ? <Alert type="error" showIcon message={error} action={<Button onClick={onRetry}>Try again</Button>} />
        : requests.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No open delivery invoice requests." />
          : <div className="financeInvoiceRequestList">
            {requests.map((requestItem) => (
              <article key={requestItem.id} className="financeInvoiceRequestItem">
                <div>
                  <Space size={6} wrap>
                    <Typography.Text strong>{requestItem.plateNumber}</Typography.Text>
                    <Typography.Text type="secondary">{requestItem.vehicleLabel}</Typography.Text>
                  </Space>
                  <Typography.Text>{requestItem.customerName}</Typography.Text>
                  <Typography.Text className="financeInvoiceRequestReason">Requested: {requestItem.requestReason}</Typography.Text>
                  <Typography.Text type="secondary">{String(requestItem.requestedAt).replace("T", " ").slice(0, 16)}</Typography.Text>
                </div>
                <Button
                  type="primary"
                  loading={resolvingId === requestItem.id}
                  disabled={Boolean(resolvingId && resolvingId !== requestItem.id)}
                  onClick={() => onResolve(requestItem)}
                >Mark resolved</Button>
              </article>
            ))}
          </div>}
    </ProCard>
  );
}

export function FinancePage({
  vehicles,
  customers,
  owners,
  payments,
  paymentLoadError,
  paymentRefreshing,
  financeVehicleOptionLoadError,
  financeVehicleOptionRefreshing,
  settlements,
  dailySpends,
  brokerCommissions,
  debtRecoveries,
  paymentVouchers,
  currentUser,
  dashboardFocus,
  onClearDashboardFocus,
  onRetryPayments,
  onRetryFinanceVehicleOptions,
  cashHandovers,
  cashHandoverPaymentLookup,
  onCreate,
  onUpdate,
  onApproveManagementReview,
  onCreateFinanceSale,
  onApproveNettPriceOverride,
  onIssueInvoice,
  onCreateCollection,
  onUpdateCollectionFinancingStatus,
  onReconcileCollection,
  onReverseCollection,
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
  onApprovePaymentVoucher,
  onMarkPaymentVoucherPaid,
  onExportPayments,
  onExportAutoCount,
  onUploadDocument,
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
  paymentLoadError: string | null;
  paymentRefreshing: boolean;
  financeVehicleOptionLoadError: string | null;
  financeVehicleOptionRefreshing: boolean;
  settlements: SettlementReminder[];
  dailySpends: DailySpend[];
  brokerCommissions: BrokerCommission[];
  debtRecoveries: DebtRecoveryCase[];
  paymentVouchers: PaymentVoucher[];
  currentUser: CurrentUser | null;
  dashboardFocus: DashboardDrilldown;
  onClearDashboardFocus: (tab: string) => void;
  onRetryPayments: () => Promise<void>;
  onRetryFinanceVehicleOptions: () => Promise<void>;
  cashHandovers: CashHandover[];
  cashHandoverPaymentLookup: CashHandoverPaymentLookup[];
  onCreate: (payment: PaymentRecord) => void;
  onUpdate: (payment: PaymentRecord) => void;
  onApproveManagementReview: (paymentId: string) => Promise<void>;
  onCreateFinanceSale: (input: FinanceSaleInput) => Promise<PaymentRecord>;
  onApproveNettPriceOverride: (paymentId: string) => Promise<PaymentRecord>;
  onIssueInvoice: (paymentId: string) => Promise<PaymentRecord>;
  onCreateCollection: (paymentId: string, input: CollectionCreateInput) => Promise<PaymentRecord>;
  onUpdateCollectionFinancingStatus: (collectionId: string, status: FinancingStatus) => Promise<PaymentRecord>;
  onReconcileCollection: (collectionId: string) => Promise<PaymentRecord>;
  onReverseCollection: (collectionId: string, reason: string) => Promise<PaymentRecord>;
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
  onApprovePaymentVoucher: (voucherId: string) => Promise<void>;
  onMarkPaymentVoucherPaid: (voucherId: string, evidenceReference: string) => Promise<void>;
  onExportPayments: () => Promise<string>;
  onExportAutoCount: (from?: string, to?: string) => Promise<Blob>;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory, owner?: DocumentUploadOwner) => Promise<void>;
  onCreateCashHandover: (paymentRecordId: string, amount: number, notes?: string) => Promise<void>;
  onRequestCashHandover: (id: string) => Promise<void>;
  onRecordCashHandover: (id: string) => Promise<void>;
  onAcceptCashHandover: (id: string) => Promise<void>;
  onRejectCashHandover: (id: string, reason: string) => Promise<void>;
}) {
  const canManageFinance = !currentUser?.isAuthenticated || currentUser.roles.some((role) => role === "BossAdmin" || role === "Finance");
  const canApproveManagementReview = Boolean(currentUser?.roles.includes("BossAdmin"));
  const eligiblePaymentVehicles = vehicles.filter((vehicle) => Boolean(vehicle.customerId));
  const eligibleInvoiceVehicles = eligiblePaymentVehicles.filter((vehicle) => !payments.some((payment) => payment.vehicleId === vehicle.id));
  const canPrepareInvoice = canPrepareFinanceInvoice(paymentLoadError, financeVehicleOptionLoadError, eligibleInvoiceVehicles.length);
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
  const [autoCountPeriod, setAutoCountPeriod] = useState<{ from?: string; to?: string }>({});
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>("PaymentReceipt");
  const [documentReloadKey, setDocumentReloadKey] = useState(0);
  const [paymentDocuments, setPaymentDocuments] = useState<VehicleDocument[]>([]);
  const [paymentDocumentsLoadError, setPaymentDocumentsLoadError] = useState<string>();
  const [paymentDocumentsLoading, setPaymentDocumentsLoading] = useState(false);
  const [paymentOcrDraft, setPaymentOcrDraft] = useState<OcrReviewValues | null>(null);
  const [invoiceUpdateRequests, setInvoiceUpdateRequests] = useState<DeliveryInvoiceUpdateRequestItem[]>([]);
  const [invoiceRequestLoading, setInvoiceRequestLoading] = useState(canManageFinance);
  const [invoiceRequestError, setInvoiceRequestError] = useState<string>();
  const [resolvingInvoiceRequestId, setResolvingInvoiceRequestId] = useState<string>();
  const [prepareInvoiceOpen, setPrepareInvoiceOpen] = useState(false);
  const [adjustInvoicePrice, setAdjustInvoicePrice] = useState(false);
  const [collectionPaymentId, setCollectionPaymentId] = useState<string>();
  const [collectionIdempotencyKey, setCollectionIdempotencyKey] = useState<string>();
  const [v2DetailsPaymentId, setV2DetailsPaymentId] = useState<string>();
  const [reverseCollectionId, setReverseCollectionId] = useState<string>();
  const [reverseReason, setReverseReason] = useState("");
  const [v2MutationKey, setV2MutationKey] = useState<string>();
  const [prepareInvoiceForm] = Form.useForm<FinanceSaleInput>();
  const [collectionForm] = Form.useForm<CollectionFormValues>();
  const selectedPayment = payments.find((payment) => payment.id === uploadPaymentId) ?? payments[0];
  const selectedEditPayment = payments.find((payment) => payment.id === editPaymentId) ?? payments[0];
  const selectedCollectionPayment = payments.find((payment) => payment.id === collectionPaymentId);
  const selectedV2DetailsPayment = payments.find((payment) => payment.id === v2DetailsPaymentId);
  const vehicleOptions = vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }));
  const selectedEditSettlement = settlements.find((settlement) => settlement.id === editSettlementId) ?? settlements[0];
  const selectedEditDailySpend = dailySpends.find((spend) => spend.id === editDailySpendId) ?? dailySpends[0];
  const selectedEditBrokerCommission = brokerCommissions.find((commission) => commission.id === editBrokerCommissionId) ?? brokerCommissions[0];
  const selectedEditDebtRecovery = debtRecoveries.find((debt) => debt.id === editDebtRecoveryId) ?? debtRecoveries[0];
  const selectedEditPaymentVoucher = paymentVouchers.find((voucher) => voucher.id === editPaymentVoucherId) ?? paymentVouchers[0];
  const dashboardToday = singaporeTodayIsoDate();
  const dashboardFocusActive = Boolean(dashboardFocus.vehicleId || dashboardFocus.attention);
  const invoiceSalesPrice = Form.useWatch("salesPrice", prepareInvoiceForm) ?? 0;
  const invoiceAdditionalCharges = Form.useWatch("interestAdditionalCharges", prepareInvoiceForm) ?? 0;
  const invoiceNcdAmount = Form.useWatch("ncdAmount", prepareInvoiceForm) ?? 0;
  const invoiceWindscreenCharges = Form.useWatch("windscreenCharges", prepareInvoiceForm) ?? 0;
  const invoiceAgreedTotal = Form.useWatch("nettPrice", prepareInvoiceForm);
  const selectedCollectionMethod = Form.useWatch("method", collectionForm);
  const invoiceCalculatedTotal = calculateFinanceNettPrice({
    salesPrice: Number(invoiceSalesPrice),
    interestAdditionalCharges: Number(invoiceAdditionalCharges),
    ncdAmount: Number(invoiceNcdAmount),
    windscreenCharges: Number(invoiceWindscreenCharges)
  });
  const invoiceSubmitLabel = financeInvoiceSubmitLabel(invoiceCalculatedTotal, invoiceAgreedTotal, adjustInvoicePrice);

  const loadInvoiceUpdateRequests = useCallback(async () => {
    if (!canManageFinance) return;
    setInvoiceRequestLoading(true);
    try {
      setInvoiceUpdateRequests(await getDeliveryInvoiceUpdateRequests());
      setInvoiceRequestError(undefined);
    } catch (error) {
      setInvoiceRequestError(humanizeApiError(error, "Delivery invoice update requests could not be loaded."));
    } finally {
      setInvoiceRequestLoading(false);
    }
  }, [canManageFinance]);

  useEffect(() => {
    void loadInvoiceUpdateRequests();
  }, [loadInvoiceUpdateRequests]);

  const confirmInvoiceRequestResolved = (requestItem: DeliveryInvoiceUpdateRequestItem) => {
    Modal.confirm({
      title: `Mark ${requestItem.plateNumber} invoice request resolved?`,
      content: "Confirm only after the requested invoice correction is complete. Delivery will then be able to continue its release checks.",
      okText: "Mark resolved",
      cancelText: "Keep open",
      onOk: async () => {
        setResolvingInvoiceRequestId(requestItem.id);
        try {
          await resolveDeliveryInvoiceUpdate(requestItem.id);
          message.success("Delivery invoice request marked resolved");
          await loadInvoiceUpdateRequests();
        } catch (error) {
          message.error(humanizeApiError(error, "Invoice update request could not be resolved."));
          throw error;
        } finally {
          setResolvingInvoiceRequestId(undefined);
        }
      }
    });
  };

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
    onClearDashboardFocus(nextTab);
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
      setPaymentDocumentsLoadError(undefined);
      setPaymentDocumentsLoading(false);
      return () => {
        active = false;
      };
    }

    setPaymentDocumentsLoading(true);
    setPaymentDocumentsLoadError(undefined);
    void getVehicleDocumentsStrict(selectedPayment.vehicleId)
      .then((documents) => {
        if (active) setPaymentDocuments(documents.filter((document) => document.paymentRecordId === selectedPayment.id));
      })
      .catch((error) => {
        if (!active) return;
        setPaymentDocuments([]);
        setPaymentDocumentsLoadError(humanizeApiError(error, "Payment evidence could not be loaded."));
      })
      .finally(() => {
        if (active) setPaymentDocumentsLoading(false);
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

  const runV2Mutation = async <T,>(key: string, action: () => Promise<T>) => {
    setV2MutationKey(key);
    try {
      return await action();
    } finally {
      setV2MutationKey(undefined);
    }
  };

  const openPrepareInvoice = () => {
    if (!canPrepareInvoice) return;
    const vehicle = eligibleInvoiceVehicles[0];
    if (!vehicle) return;
    setAdjustInvoicePrice(false);
    prepareInvoiceForm.setFieldsValue({
      vehicleId: vehicle.id,
      ...financeInvoiceVehicleDefaults(vehicle)
    });
    setPrepareInvoiceOpen(true);
  };

  const updateInvoiceVehicleDefaults = (vehicleId: string) => {
    const vehicle = eligibleInvoiceVehicles.find((item) => item.id === vehicleId);
    if (!vehicle) return;
    prepareInvoiceForm.setFieldsValue(financeInvoiceVehicleDefaults(vehicle));
    setAdjustInvoicePrice(false);
  };

  const prepareFinanceSale = (values: FinanceSaleInput) => {
    const input: FinanceSaleInput = {
      vehicleId: values.vehicleId,
      salesPrice: Number(values.salesPrice ?? 0),
      interestAdditionalCharges: Number(values.interestAdditionalCharges ?? 0),
      ncdAmount: Number(values.ncdAmount ?? 0),
      windscreenCharges: Number(values.windscreenCharges ?? 0),
      ...(adjustInvoicePrice ? {
        nettPrice: Number(values.nettPrice ?? 0),
        nettPriceOverrideReason: values.nettPriceOverrideReason?.trim() || undefined
      } : {})
    };
    const blockReason = financeSaleBlockReason(input, eligibleInvoiceVehicles);
    if (blockReason) {
      message.warning(blockReason);
      return;
    }

    const vehicle = vehicles.find((item) => item.id === input.vehicleId);
    const agreedTotal = input.nettPrice ?? calculateFinanceNettPrice(input);
    const hasVariance = agreedTotal !== calculateFinanceNettPrice(input);
    Modal.confirm({
      title: hasVariance ? "Send adjusted price for approval?" : "Generate this invoice?",
      content: `${vehicle?.plateNumber ?? "Selected vehicle"} · ${formatMoney(agreedTotal)}${hasVariance ? " · Boss/Admin approval is required before issue." : ""}`,
      okText: hasVariance ? "Send for approval" : "Generate invoice",
      cancelText: "Check again",
      onOk: async () => {
        await runV2Mutation("prepare-invoice", () => onCreateFinanceSale(input));
        setPrepareInvoiceOpen(false);
        prepareInvoiceForm.resetFields();
        setAdjustInvoicePrice(false);
      }
    });
  };

  const openAddPayment = (payment: PaymentRecord) => {
    const amount = payment.availableToAllocate ?? payment.balanceAmount ?? payment.nettPrice;
    setUploadPaymentId(payment.id);
    setCollectionPaymentId(payment.id);
    setCollectionIdempotencyKey(newId());
    collectionForm.setFieldsValue({
      amount,
      method: "BankTransfer",
      financingStatus: "NotApplicable",
      receivedDate: dayjs(),
      reference: undefined,
      notes: undefined
    });
  };

  const submitCollection = async (values: CollectionFormValues) => {
    if (!selectedCollectionPayment || !collectionIdempotencyKey) return;
    const input: CollectionCreateInput = {
      idempotencyKey: collectionIdempotencyKey,
      amount: Number(values.amount ?? 0),
      method: values.method,
      financingStatus: values.method === "BankDisbursement" ? values.financingStatus : "NotApplicable",
      reference: values.reference?.trim() || undefined,
      receivedDate: values.receivedDate?.format("YYYY-MM-DD") ?? "",
      notes: values.notes?.trim() || undefined
    };
    const blockReason = collectionCreateBlockReason(selectedCollectionPayment, input);
    if (blockReason) {
      message.warning(blockReason);
      return;
    }

    const save = async () => {
      const updated = await runV2Mutation(`collection-${selectedCollectionPayment.id}`, () => onCreateCollection(selectedCollectionPayment.id, input));
      setCollectionPaymentId(undefined);
      setCollectionIdempotencyKey(undefined);
      collectionForm.resetFields();
      setUploadPaymentId(updated.id);
      setV2DetailsPaymentId(updated.id);
    };
    const balance = selectedCollectionPayment.balanceAmount ?? selectedCollectionPayment.nettPrice;
    if (input.amount === balance) {
      Modal.confirm({
        title: "This payment covers the remaining balance",
        content: "Add it now? The sale becomes Paid only after Finance reconciles the payment.",
        okText: "Add payment",
        cancelText: "Check again",
        onOk: save
      });
      return;
    }
    try {
      await save();
    } catch {
      // The app-level mutation handler already surfaces the server validation message.
    }
  };

  const approveAndIssueInvoice = (payment: PaymentRecord) => {
    Modal.confirm({
      title: "Approve the adjusted price and issue the invoice?",
      content: `${plateFor(vehicles, payment.vehicleId)} · ${formatMoney(payment.nettPrice)} · ${payment.nettPriceOverrideReason ?? "Manual adjustment"}`,
      okText: "Approve & issue",
      cancelText: "Cancel",
      onOk: async () => {
        await runV2Mutation(`approve-${payment.id}`, () => onApproveNettPriceOverride(payment.id));
      }
    });
  };

  const updateFinancing = async (collection: CollectionTransaction, status: FinancingStatus) => {
    try {
      await runV2Mutation(`financing-${collection.id}`, () => onUpdateCollectionFinancingStatus(collection.id, status));
    } catch {
      // The app-level mutation handler already surfaces the server validation message.
    }
  };

  const reconcileV2Collection = async (collection: CollectionTransaction) => {
    try {
      await runV2Mutation(`reconcile-${collection.id}`, () => onReconcileCollection(collection.id));
    } catch {
      // The app-level mutation handler already surfaces the server validation message.
    }
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

  const handleExportAutoCount = async () => {
    try {
      const workbook = await onExportAutoCount(autoCountPeriod.from, autoCountPeriod.to);
      const url = URL.createObjectURL(workbook);
      const link = document.createElement("a");
      link.href = url;
      const period = autoCountPeriod.from && autoCountPeriod.to ? `${autoCountPeriod.from}-${autoCountPeriod.to}` : "all";
      link.download = `autocount-v2-${period}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      message.success("AutoCount Excel workbook exported for manual submission");
    } catch (error) {
      message.error(humanizeApiError(error, "AutoCount workbook export failed. Please try again."));
    }
  };

  const v2PrimaryAction = (payment: PaymentRecord) => {
    const available = payment.availableToAllocate ?? payment.balanceAmount ?? payment.nettPrice;
    if (payment.receivableStatus === "WaitingForApproval") {
      return canApproveManagementReview
        ? <Button size="small" type="primary" loading={v2MutationKey === `approve-${payment.id}`} onClick={() => approveAndIssueInvoice(payment)}>Approve & issue</Button>
        : <Button size="small" type="primary" onClick={() => openV2Details(payment.id)}>View approval request</Button>;
    }
    if (!payment.invoice) return <Button size="small" type="primary" loading={v2MutationKey === `invoice-${payment.id}`} onClick={() => void runV2Mutation(`invoice-${payment.id}`, () => onIssueInvoice(payment.id)).catch(() => undefined)}>Issue invoice</Button>;
    if (payment.collections?.some((collection) => collection.status === "Pending")) return <Button size="small" type="primary" onClick={() => openV2Details(payment.id)}>Review payment</Button>;
    if (payment.receivableStatus === "Paid") return <Button size="small" type="primary" onClick={() => openV2Details(payment.id)}>View</Button>;
    if (available > 0 && payment.receivableStatus !== "AttentionNeeded") return <Button size="small" type="primary" onClick={() => openAddPayment(payment)}>Add payment</Button>;
    return <Button size="small" type="primary" onClick={() => openV2Details(payment.id)}>View</Button>;
  };

  const openV2Details = (paymentId: string) => {
    setUploadPaymentId(paymentId);
    setV2DetailsPaymentId(paymentId);
  };

  const collectionHistory = (payment: PaymentRecord) => (
    <section className="financeCollectionHistory" aria-label="Collection history">
      <div className="financeCollectionHistoryHeader">
        <Typography.Title level={5}>Payment history / 收款记录</Typography.Title>
        <Tag>{payment.collections?.length ?? 0} record{payment.collections?.length === 1 ? "" : "s"}</Tag>
      </div>
      {selectedPayment?.id === payment.id && paymentDocumentsLoadError && <Alert type="error" showIcon message="Payment evidence is unavailable" description={paymentDocumentsLoadError} action={<Button size="small" onClick={() => setDocumentReloadKey((value) => value + 1)}>Retry</Button>} />}
      {(payment.collections?.length ?? 0) === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No payments added yet." /> : payment.collections?.map((collection) => {
        const bankDisbursement = collection.method === "BankDisbursement";
        const evidence = paymentDocuments.filter((document) => document.collectionTransactionId === collection.id);
        const hasEvidence = evidence.length > 0;
        const evidenceUnavailable = selectedPayment?.id !== payment.id || paymentDocumentsLoading || Boolean(paymentDocumentsLoadError);
        const createdByCurrentUser = Boolean(currentUser?.id && collection.createdBy === currentUser.id);
        const canReconcile = collection.status === "Pending" && !evidenceUnavailable && hasEvidence && !createdByCurrentUser && (!bankDisbursement || collection.financingStatus === "Disbursed");
        return <article className="financeCollectionItem" key={collection.id}>
          <div><strong>{formatMoney(collection.amount)}</strong><Tag color={collection.status === "Reconciled" ? "green" : collection.status === "Reversed" ? "red" : "gold"}>{collectionStatusLabel(collection.status)}</Tag></div>
          <dl>
            <div><dt>Method</dt><dd>{collectionMethodLabel(collection.method)}</dd></div>
            <div><dt>Received</dt><dd>{collection.receivedDate}</dd></div>
            <div><dt>Reference</dt><dd>{collection.reference || "-"}</dd></div>
            {bankDisbursement && <div><dt>Financing</dt><dd>{financingStatusLabel(collection.financingStatus)}</dd></div>}
          </dl>
          {collection.notes && <Typography.Paragraph type="secondary">{collection.notes}</Typography.Paragraph>}
          {collection.reversalReason && <Alert type="warning" showIcon message={`Reversed: ${collection.reversalReason}`} />}
          <Space wrap size={6}>
            <Tag color={evidenceUnavailable ? "red" : hasEvidence ? "green" : "gold"}>{evidenceUnavailable ? paymentDocumentsLoading ? "Loading evidence" : "Evidence unavailable" : hasEvidence ? `${evidence.length} evidence file${evidence.length === 1 ? "" : "s"}` : "Evidence needed"}</Tag>
            {collection.status === "Pending" && <Upload accept="image/*,.pdf" maxCount={1} showUploadList={false} customRequest={async (option) => {
              try {
                await onUploadDocument(payment.vehicleId, option.file as File, "PaymentReceipt", { paymentRecordId: payment.id, collectionTransactionId: collection.id });
                setDocumentReloadKey((value) => value + 1);
                option.onSuccess?.({ ok: true });
              } catch (error) {
                option.onError?.(error instanceof Error ? error : new Error("Evidence upload failed."));
              }
            }}><Button size="small">{hasEvidence ? "Add evidence" : "Attach evidence"}</Button></Upload>}
          </Space>
          {evidence.length > 0 && <div className="financeCollectionEvidenceList">{evidence.map((document) => <div key={document.id}><Typography.Link href={vehicleDocumentContentUrl(payment.vehicleId, document.id)} target="_blank">{document.fileName}</Typography.Link><Typography.Text type="secondary">Uploaded {document.uploadedAt.slice(0, 10)} by {financeRequesterLabel(document.uploadedBy, currentUser?.id)}</Typography.Text></div>)}</div>}
          {collection.status !== "Reversed" && <Space wrap className="financeCollectionActions">
            {bankDisbursement && collection.status === "Pending" && collection.financingStatus === "Pending" && <Button size="small" loading={v2MutationKey === `financing-${collection.id}`} onClick={() => void updateFinancing(collection, "Approved")}>Record bank approval</Button>}
            {bankDisbursement && collection.status === "Pending" && collection.financingStatus === "Approved" && <Button size="small" loading={v2MutationKey === `financing-${collection.id}`} onClick={() => Modal.confirm({ title: "Record funds disbursed?", content: "Confirm the bank has released the funds. This will make the payment available for Finance reconciliation.", okText: "Record funds disbursed", cancelText: "Cancel", onOk: () => updateFinancing(collection, "Disbursed") })}>Record funds disbursed</Button>}
            {collection.status === "Pending" && <Tooltip title={canReconcile ? "" : evidenceUnavailable ? "Load the linked evidence before reconciliation." : !hasEvidence ? "Attach payment evidence before reconciliation." : createdByCurrentUser ? "Another Finance user must reconcile a payment you recorded." : "Bank financing must be disbursed before reconciliation."}><span><Button size="small" disabled={!canReconcile} loading={v2MutationKey === `reconcile-${collection.id}`} onClick={() => Modal.confirm({ title: "Reconcile this payment?", content: "Only reconcile after the amount is visible in the company account.", okText: "Reconcile", cancelText: "Cancel", onOk: () => reconcileV2Collection(collection) })}>Reconcile</Button></span></Tooltip>}
            {collection.status === "Reconciled" && canApproveManagementReview && <Button size="small" danger onClick={() => { setReverseCollectionId(collection.id); setReverseReason(""); }}>Reverse</Button>}
          </Space>}
        </article>;
      })}
    </section>
  );

  const columns: ColumnsType<PaymentRecord> = [
    { title: "Vehicle & Customer / 车辆与客户", dataIndex: "vehicleId", render: (vehicleId, row) => isFinanceV2(row) ? <Space direction="vertical" size={0}><Typography.Text strong>{plateFor(vehicles, vehicleId)}</Typography.Text><Typography.Text type="secondary">{customerLabel(customers, row.customerId ?? vehicles.find((vehicle) => vehicle.id === vehicleId)?.customerId)}</Typography.Text></Space> : plateFor(vehicles, vehicleId) },
    { title: "Invoice Total / 发票总额", dataIndex: "nettPrice", render: (value, row) => formatMoney(isFinanceV2(row) ? row.invoice?.amount ?? value : value) },
    { title: "Collected / 已收", render: (_, row) => isFinanceV2(row) ? formatMoney(row.collectedAmount ?? 0) : <Tag color={row.status === "Reconciled" ? "green" : "orange"}>{row.status}</Tag> },
    { title: "Balance Due / 未收", render: (_, row) => isFinanceV2(row) ? formatMoney(row.balanceAmount ?? row.nettPrice) : <Space direction="vertical" size={0}><Typography.Text>{row.receiptNumber || "No receipt"}</Typography.Text><Typography.Text type="secondary">{row.invoiceNumber || "No invoice"}</Typography.Text></Space> },
    { title: "Status & Invoice / 状态与发票", render: (_, row) => isFinanceV2(row) ? <Space direction="vertical" size={2}><Tag color={receivableStatusColor(row.receivableStatus)}>{receivableStatusLabel(row.receivableStatus)}</Tag>{row.invoice ? <Typography.Link href={financeInvoiceContentUrl(row.invoice.id)} target="_blank">{row.invoice.invoiceNumber} PDF</Typography.Link> : <Typography.Text type="secondary">Invoice not issued</Typography.Text>}</Space> : <Space wrap size={4}><Tag>Legacy</Tag><Tag color={row.bossChecked ? "green" : "orange"}>{row.bossChecked ? "Reviewed" : "Review pending"}</Tag>{paymentChecklistReady(row) ? <Tag color="green">Checklist done</Tag> : <Tag color="gold">Checklist pending</Tag>}</Space> },
    {
      title: "Next Action / 操作",
      fixed: "right",
      width: 210,
      render: (_, row) => {
        if (isFinanceV2(row)) return <div className="financeV2PrimaryAction">{v2PrimaryAction(row)}</div>;
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
    { title: "Amount / 金额", dataIndex: "amount", render: (value) => formatMoney(value) },
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
    { title: "Amount / 金额", dataIndex: "amount", render: (value) => formatMoney(value) },
    { title: "Due / 到期", dataIndex: "dueDate" },
    { title: "Status / 状态", dataIndex: "isPaid", render: (isPaid) => <Tag color={isPaid ? "green" : "red"}>{isPaid ? "Paid" : "Due"}</Tag> },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 190,
      render: (_, row) => (
        <Space className="tableActionGroup" wrap size={6}>
          <Button size="small" type="primary" onClick={() => selectDailySpend(row.id)}>Details</Button>
          <Button size="small" onClick={() => onUpdateDailySpend(payDailySpend(row))} disabled={row.isPaid}>Pay</Button>
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
    { title: "Commission / 佣金", dataIndex: "amount", render: (value) => formatMoney(value) },
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
    { title: "Balance / 欠款", dataIndex: "balanceAmount", render: (value) => formatMoney(value) },
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
    { title: "Amount / 金额", dataIndex: "amount", render: (value) => formatMoney(value) },
    { title: "Issued / 日期", dataIndex: "issuedDate" },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Paid" ? "green" : status === "Approved" ? "blue" : "orange"}>{status}</Tag> },
    { title: "Notes / 备注", dataIndex: "notes", render: (value) => value || "-" },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 260,
      render: (_, row) => (
        <Space className="tableActionGroup" wrap size={6}>
          <Button size="small" type="primary" onClick={() => selectPaymentVoucher(row.id)}>Details</Button>
          <Button size="small" href={paymentVoucherPdfUrl(row.id)} target="_blank">PDF</Button>
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
    plateFor(vehicles, payment.vehicleId),
    customerLabel(customers, payment.customerId ?? vehicles.find((vehicle) => vehicle.id === payment.vehicleId)?.customerId),
    payment.receiptNumber, payment.invoiceNumber, payment.invoice?.invoiceNumber, payment.bankName, payment.bankFollowUpDate,
    ...(payment.collections ?? []).flatMap((collection) => [collection.reference, collection.method, collection.status, collection.financingStatus])
  ], (payment) => isFinanceV2(payment)
    ? [payment.receivableStatus ?? "Draft", ...(payment.collections ?? []).flatMap((collection) => [collection.status, collection.financingStatus])]
    : payment.status).filter((payment) => matchesDashboardFinanceFocus(dashboardFocus, payment.vehicleId, dashboardFocus.attention === "open" ? isFinanceV2(payment) ? payment.receivableStatus !== "Paid" : payment.status !== "Reconciled" : true));
  const filteredSettlements = filterFinanceRows(settlements, financeKeyword, financeStatus, (settlement) => [
    plateFor(vehicles, settlement.vehicleId), contactFor(owners, settlement.ownerId), settlement.deadline
  ], (settlement) => settlement.isPaid ? "Paid" : "Due").filter((settlement) => matchesDashboardFinanceFocus(dashboardFocus, settlement.vehicleId, settlementMatchesDashboardAttention(settlement, dashboardFocus.attention, dashboardToday)));
  const filteredDailySpends = filterFinanceRows(dailySpends, financeKeyword, financeStatus, (spend) => [spend.description, spend.dueDate], (spend) => spend.isPaid ? "Paid" : "Due").filter((spend) => matchesDashboardFinanceFocus(dashboardFocus, undefined, dailySpendMatchesDashboardAttention(spend, dashboardFocus.attention, dashboardToday)));
  const filteredBrokerCommissions = filterFinanceRows(brokerCommissions, financeKeyword, financeStatus, (commission) => [
    plateFor(vehicles, commission.vehicleId), commission.brokerName
  ], (commission) => commission.isPaid ? "Paid" : "Unpaid").filter((commission) => matchesDashboardFinanceFocus(dashboardFocus, commission.vehicleId));
  const filteredDebtRecoveries = filterFinanceRows(debtRecoveries, financeKeyword, financeStatus, (debt) => [
    plateFor(vehicles, debt.vehicleId), customerLabel(customers, debt.customerId), debt.followUpDate, debt.notes
  ], (debt) => debt.status).filter((debt) => matchesDashboardFinanceFocus(dashboardFocus, debt.vehicleId, dashboardFocus.attention === "open" ? debt.status !== "Closed" : true));
  const filteredPaymentVouchers = filterFinanceRows(paymentVouchers, financeKeyword, financeStatus, (voucher) => [
    plateFor(vehicles, voucher.vehicleId), voucher.payeeName, voucher.purpose, voucher.issuedDate, voucher.notes
  ], (voucher) => voucher.status).filter((voucher) => matchesDashboardFinanceFocus(dashboardFocus, voucher.vehicleId, dashboardFocus.attention === "open" ? voucher.status !== "Paid" : dashboardFocus.attention === "due" ? voucher.status !== "Paid" && voucher.issuedDate <= dashboardToday : true));
  const financeStatusOptions = statusOptionsForFinanceTab(financeTab);
  const searchCopy = financeSearchCopy(financeTab);
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
  const financeFiltersActive = Boolean(financeKeyword.trim() || financeStatus || dashboardFocusActive);
  const financeFilters = (
    <Space wrap className="toolbarForm">
      <Input.Search
        aria-label={searchCopy.ariaLabel}
        className="financeKeywordFilter"
        allowClear
        value={financeKeyword}
        placeholder={searchCopy.placeholder}
        onChange={(event) => {
          setFinanceKeyword(event.target.value);
          setFinancePage(1);
        }}
        onSearch={(value) => {
          setFinanceKeyword(value);
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
      {dashboardFocusActive && <Button
        onClick={() => onClearDashboardFocus(financeTab)}
      >
        Clear dashboard focus
      </Button>}
      {(financeKeyword.trim() || financeStatus) && <Button
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
  const outstanding = payments.reduce((sum, payment) => sum + (isFinanceV2(payment) ? payment.balanceAmount ?? payment.nettPrice : payment.status !== "Reconciled" ? payment.nettPrice : 0), 0);
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
          { label: "Cash value", value: formatMoney(cashHandovers.reduce((total, handover) => total + handover.amount, 0)) }
        ];
      case "settlements":
        return [
          { label: "Rows", value: settlements.length },
          { label: "Due", value: settlements.filter((settlement) => !settlement.isPaid).length },
          { label: "Outstanding", value: formatMoney(settlementOutstanding) }
        ];
      case "commissions":
        return [
          { label: "Rows", value: brokerCommissions.length },
          { label: "Unpaid", value: brokerCommissions.filter((commission) => !commission.isPaid).length },
          { label: "Outstanding", value: formatMoney(brokerCommissionOutstanding) }
        ];
      case "debt":
        return [
          { label: "Cases", value: debtRecoveries.length },
          { label: "Open", value: debtRecoveries.filter((debt) => debt.status !== "Closed").length },
          { label: "Balance", value: formatMoney(debtOutstanding) }
        ];
      case "vouchers":
        return [
          { label: "Rows", value: paymentVouchers.length },
          { label: "Open", value: paymentVouchers.filter((voucher) => voucher.status !== "Paid").length },
          { label: "Amount", value: formatMoney(voucherOutstanding) }
        ];
      case "daily":
        return [
          { label: "Rows", value: dailySpends.length },
          { label: "Due", value: dailySpends.filter((spend) => !spend.isPaid).length },
          { label: "Amount", value: formatMoney(dailySpendOutstanding) }
        ];
      default:
        return [
          { label: "Sales", value: payments.length },
          { label: "Need collection", value: payments.filter((payment) => isFinanceV2(payment) ? payment.receivableStatus !== "Paid" : payment.status !== "Reconciled").length },
          { label: "Balance due", value: formatMoney(outstanding) }
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
              { key: "payments", label: "Invoices & Collections / 发票与收款" },
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
      {dashboardFocusActive && <Alert
        type="info"
        showIcon
        message={dashboardFocus.vehicleId ? "Dashboard focus: records for the selected vehicle" : dashboardFocus.attention === "dueSoon" ? "Dashboard focus: Daily Spend due soon" : dashboardFocus.attention === "due" ? "Dashboard focus: due follow-up items" : "Dashboard focus: open follow-up items"}
        action={<Button size="small" onClick={() => onClearDashboardFocus(financeTab)}>Clear focus</Button>}
      />}
      {canManageFinance && <InvoiceUpdateRequestQueue
        requests={invoiceUpdateRequests}
        loading={invoiceRequestLoading}
        error={invoiceRequestError}
        resolvingId={resolvingInvoiceRequestId}
        onRetry={() => void loadInvoiceUpdateRequests()}
        onResolve={confirmInvoiceRequestResolved}
      />}
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
        title="Invoices & Collections / 发票与收款"
        extra={<Space wrap>
          <DatePicker.RangePicker
            aria-label="AutoCount export period"
            onChange={(dates) => setAutoCountPeriod(dates?.[0] && dates?.[1] ? { from: dates[0].format("YYYY-MM-DD"), to: dates[1].format("YYYY-MM-DD") } : {})}
          />
          <Button disabled={Boolean(paymentLoadError)} onClick={handleExportAutoCount}>Export for AutoCount (.xlsx)</Button>
          <Button disabled={Boolean(paymentLoadError)} onClick={handleExportPayments}>Legacy export (.csv)</Button>
          <Button type="primary" disabled={!canPrepareInvoice} onClick={openPrepareInvoice}>Prepare invoice</Button>
        </Space>}
      >
        <Space direction="vertical" size={12} className="fullWidth">
          <Alert type="info" showIcon message="YS Heng issues the invoice here. The AutoCount Excel export is reviewed and submitted manually; it is not a direct integration." />
          {paymentLoadError && <Alert type="error" showIcon message="Finance records are unavailable" description={`${paymentLoadError} No demo or cached balances are shown.`} action={<Button loading={paymentRefreshing} onClick={() => void onRetryPayments()}>Retry</Button>} />}
          {financeVehicleOptionLoadError && <Alert type="error" showIcon message="Vehicle prices are unavailable" description={`${financeVehicleOptionLoadError} Invoice preparation is disabled until the current selling price and additional charges load.`} action={<Button loading={financeVehicleOptionRefreshing} onClick={() => void onRetryFinanceVehicleOptions()}>Retry</Button>} />}
          {financeFilters}
          {!financeVehicleOptionLoadError && eligiblePaymentVehicles.length === 0 && <Alert type="warning" showIcon message="Link a confirmed buyer to a vehicle before preparing an invoice." />}
          {!financeVehicleOptionLoadError && eligiblePaymentVehicles.length > 0 && eligibleInvoiceVehicles.length === 0 && <Alert type="info" showIcon message="All buyer-linked vehicles already have a finance record. Search the records below to continue collection work." />}
          <div className="mobileRecordList">
          {filteredPayments.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={paymentEmptyText} />}
          {visiblePayments.map((payment) => {
            if (isFinanceV2(payment)) {
              return (
                <article className="mobileRecordCard financeV2MobileCard" key={payment.id}>
                  <div className="mobileRecordHeader">
                    <div>
                      <Typography.Text className="mobileRecordEyebrow">Car Plate / 车牌</Typography.Text>
                      <Typography.Title level={5}>{plateFor(vehicles, payment.vehicleId)}</Typography.Title>
                      <Typography.Text type="secondary">{customerLabel(customers, payment.customerId ?? vehicles.find((vehicle) => vehicle.id === payment.vehicleId)?.customerId)}</Typography.Text>
                    </div>
                    <Tag color={receivableStatusColor(payment.receivableStatus)}>{receivableStatusLabel(payment.receivableStatus)}</Tag>
                  </div>
                  <div className="mobileRecordMeta">
                    <span><small>Invoice Total / 发票总额</small><strong>{formatMoney(payment.invoice?.amount ?? payment.nettPrice)}</strong></span>
                    <span><small>Collected / 已收</small><strong>{formatMoney(payment.collectedAmount ?? 0)}</strong></span>
                    <span><small>Balance Due / 未收</small><strong>{formatMoney(payment.balanceAmount ?? payment.nettPrice)}</strong></span>
                  </div>
                  <div className="mobileRecordFooter">
                    {payment.invoice ? <Typography.Link href={financeInvoiceContentUrl(payment.invoice.id)} target="_blank">{payment.invoice.invoiceNumber} PDF</Typography.Link> : <Typography.Text type="secondary">Invoice not issued</Typography.Text>}
                    <div className="financeV2PrimaryAction">{v2PrimaryAction(payment)}</div>
                  </div>
                </article>
              );
            }
            return (
            <article className="mobileRecordCard" key={payment.id}>
              <div className="mobileRecordHeader">
                <div>
                  <Typography.Text className="mobileRecordEyebrow">Car Plate / 车牌</Typography.Text>
                  <Typography.Title level={5}>{plateFor(vehicles, payment.vehicleId)}</Typography.Title>
                </div>
                <Space wrap size={4}><Tag>Legacy</Tag><Tag color={payment.status === "Reconciled" ? "green" : "orange"}>{payment.status}</Tag></Space>
              </div>
              <div className="mobileRecordMeta">
                <span><small>Nett Price / 净价</small><strong>{formatMoney(payment.nettPrice)}</strong></span>
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
          <OperationsProTable className="desktopDataTable" rowKey="id" columns={columns} dataSource={filteredPayments} pagination={tablePagination(filteredPayments.length, paymentPage, setFinancePage)} scroll={{ x: 960 }} locale={{ emptyText: paymentEmptyText }} />
        </Space>
      </ProCard>}
      <Modal
        title="Prepare invoice / 准备发票"
        width={700}
        open={prepareInvoiceOpen}
        onCancel={() => {
          setPrepareInvoiceOpen(false);
          setAdjustInvoicePrice(false);
          prepareInvoiceForm.resetFields();
        }}
        footer={null}
        destroyOnClose
        className="recordCreateModal financeV2Modal"
      >
        <Form form={prepareInvoiceForm} layout="vertical" className="modalForm" onFinish={prepareFinanceSale}>
          <Alert type="info" showIcon message="Check the buyer and amounts below. YS Heng generates the invoice; AutoCount only receives the reviewed Excel export." />
          <Form.Item name="vehicleId" label="Vehicle & Buyer / 车辆与买家" rules={[{ required: true, message: "Select a vehicle." }]}>
            <Select showSearch optionFilterProp="label" onChange={updateInvoiceVehicleDefaults} options={eligibleInvoiceVehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plateNumber} · ${vehicle.make} ${vehicle.model} · ${customerLabel(customers, vehicle.customerId)}` }))} />
          </Form.Item>
          <div className="financeV2AmountGrid">
            <Form.Item name="salesPrice" label="Selling price / 售价" rules={[{ required: true, message: "Selling price is required." }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="interestAdditionalCharges" label="Additional charges / 附加费用" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="ncdAmount" label={shortformLabel("NCD deduction / NCD 扣减", "No claim discount")} rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="windscreenCharges" label="Windscreen charges / 挡风玻璃费用" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          </div>
          <div className="financeV2CalculatedTotal"><span>Calculated invoice total / 系统计算总额</span><strong>{formatMoney(invoiceCalculatedTotal)}</strong><small>Selling price + additional charges + windscreen charges − NCD</small></div>
          <Checkbox checked={adjustInvoicePrice} onChange={(event) => {
            const checked = event.target.checked;
            setAdjustInvoicePrice(checked);
            prepareInvoiceForm.setFieldsValue({ nettPrice: checked ? invoiceCalculatedTotal : undefined, nettPriceOverrideReason: undefined });
          }}>Adjust price / 手动调整</Checkbox>
          {adjustInvoicePrice && <>
            <Form.Item name="nettPrice" label="Agreed invoice total / 协议总额" rules={[{ required: true, message: "Enter the agreed total." }]}><InputNumber className="fullWidth" min={0.01} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="nettPriceOverrideReason" label="Reason for adjustment / 调整原因" rules={[{ required: true, whitespace: true, message: "Explain why the total is different." }]}><Input.TextArea rows={3} maxLength={500} showCount placeholder="Example: agreed discount approved during final negotiation" /></Form.Item>
            <Alert type="warning" showIcon message="A different agreed total waits for Boss/Admin approval before the invoice is issued." />
          </>}
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" loading={v2MutationKey === "prepare-invoice"}>{invoiceSubmitLabel}</Button></Form.Item>
        </Form>
      </Modal>
      <Drawer
        title="Add payment / 新增收款"
        width={600}
        open={Boolean(collectionPaymentId)}
        onClose={() => {
          setCollectionPaymentId(undefined);
          setCollectionIdempotencyKey(undefined);
          collectionForm.resetFields();
        }}
        destroyOnClose
        className="recordEditDrawer financeV2Drawer"
      >
        {selectedCollectionPayment && <Space direction="vertical" size={16} className="fullWidth">
          <FinanceV2BalanceSummary payment={selectedCollectionPayment} vehicles={vehicles} customers={customers} />
          <Form form={collectionForm} layout="vertical" className="drawerForm" onFinish={(values) => void submitCollection(values)}>
            <Form.Item name="amount" label="Amount received / 已收金额" rules={[{ required: true, message: "Enter the payment amount." }]}><InputNumber className="fullWidth" min={0.01} max={selectedCollectionPayment.availableToAllocate ?? selectedCollectionPayment.balanceAmount ?? selectedCollectionPayment.nettPrice} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="method" label="Payment method / 收款方式" rules={[{ required: true, message: "Choose a payment method." }]}><Select onChange={(method) => collectionForm.setFieldValue("financingStatus", method === "BankDisbursement" ? "Pending" : "NotApplicable")} options={collectionMethodOptions} /></Form.Item>
            {selectedCollectionMethod === "BankDisbursement" && <Form.Item name="financingStatus" label="Bank financing status / 银行放款状态" rules={[{ required: true }]}><Select disabled options={[{ value: "Pending", label: financingStatusLabel("Pending") }]} /></Form.Item>}
            <Form.Item name="receivedDate" label="Received date / 收款日期" rules={[{ required: true, message: "Choose the received date." }]}><DatePicker className="fullWidth" /></Form.Item>
            <Form.Item name="reference" label="Payment reference / 收款编号" rules={[{ required: true, whitespace: true, message: "Enter a bank, cheque, card, or agreement reference." }]}><Input maxLength={100} placeholder="Example: bank transaction or cheque number" /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input.TextArea rows={2} maxLength={500} /></Form.Item>
            <Alert type="warning" showIcon message="Physical cash cannot be allocated to this V2 invoice yet. Existing cash records remain in Cash Custody." />
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" loading={v2MutationKey === `collection-${selectedCollectionPayment.id}`}>Add payment</Button></Form.Item>
          </Form>
          {collectionHistory(selectedCollectionPayment)}
        </Space>}
      </Drawer>
      <Drawer title="Invoice & payment details / 发票与收款详情" width={600} open={Boolean(v2DetailsPaymentId)} onClose={() => setV2DetailsPaymentId(undefined)} className="recordEditDrawer financeV2Drawer">
        {selectedV2DetailsPayment && <Space direction="vertical" size={16} className="fullWidth">
          <FinanceV2BalanceSummary payment={selectedV2DetailsPayment} vehicles={vehicles} customers={customers} />
          {(selectedV2DetailsPayment.nettPriceVariance ?? 0) !== 0 && <ProCard size="small" title="Price adjustment / 价格调整"><Descriptions size="small" column={1}>
            <Descriptions.Item label="Calculated total">{formatMoney(selectedV2DetailsPayment.calculatedNettPrice ?? selectedV2DetailsPayment.nettPrice)}</Descriptions.Item>
            <Descriptions.Item label="Agreed invoice total">{formatMoney(selectedV2DetailsPayment.nettPrice)}</Descriptions.Item>
            <Descriptions.Item label="Variance">{formatMoney(selectedV2DetailsPayment.nettPriceVariance ?? 0)}</Descriptions.Item>
            <Descriptions.Item label="Reason">{selectedV2DetailsPayment.nettPriceOverrideReason ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Requested by">{financeRequesterLabel(selectedV2DetailsPayment.nettPriceOverrideRequestedBy, currentUser?.id)}</Descriptions.Item>
            <Descriptions.Item label="Approval">{selectedV2DetailsPayment.nettPriceOverrideApprovedAt ? "Approved" : "Waiting for Boss/Admin"}</Descriptions.Item>
          </Descriptions></ProCard>}
          {selectedV2DetailsPayment.invoice && <Button block href={financeInvoiceContentUrl(selectedV2DetailsPayment.invoice.id)} target="_blank">Open invoice PDF · {selectedV2DetailsPayment.invoice.invoiceNumber}</Button>}
          {selectedV2DetailsPayment.receivableStatus !== "Paid" && (selectedV2DetailsPayment.availableToAllocate ?? 0) > 0 && <Button block type="primary" onClick={() => { setV2DetailsPaymentId(undefined); openAddPayment(selectedV2DetailsPayment); }}>Add payment</Button>}
          {collectionHistory(selectedV2DetailsPayment)}
        </Space>}
      </Drawer>
      <Modal title="Reverse reconciled payment" open={Boolean(reverseCollectionId)} okText="Reverse payment" okButtonProps={{ danger: true, disabled: !reverseReason.trim(), loading: v2MutationKey === `reverse-${reverseCollectionId}` }} onCancel={() => { setReverseCollectionId(undefined); setReverseReason(""); }} onOk={async () => {
        if (!reverseCollectionId || !reverseReason.trim()) return;
        await runV2Mutation(`reverse-${reverseCollectionId}`, () => onReverseCollection(reverseCollectionId, reverseReason.trim()));
        setReverseCollectionId(undefined);
        setReverseReason("");
      }}>
        <Alert type="warning" showIcon message="Reversal restores the outstanding balance and stays in the audit history." />
        <Typography.Text strong>Reason for reversal</Typography.Text>
        <Input.TextArea aria-label="Reason for reversal" className="financeV2ReverseReason" rows={3} maxLength={500} showCount value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} placeholder="Explain why this reconciled payment must be reversed" />
      </Modal>
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
          <Form.Item name="nettPrice" label="Collection Amount / Nett Price" rules={[{ required: true, message: "Collection amount is required." }]}><InputNumber className="fullWidth" min={0.01} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
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
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="nettPrice" label="Nett Price"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Pending", "Approved", "Disbursed", "Reconciled"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="receiptNumber" label="Receipt No."><Input placeholder="RCPT-1001" /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice No."><Input placeholder="INV-1001" /></Form.Item>
          <Form.Item name="documentsPrepared" label="Prepare Document"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="checklistValidated" label="Checklist Validation"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="salesPrice" label="Sales Price / 销售价格"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          <Form.Item name="interestAdditionalCharges" label="Interest + Additional Charges / 利息与增加项"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          <Form.Item name="ncdAmount" label={shortformLabel("NCD / 无索偿折扣", "No claim discount")}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          <Form.Item name="windscreenCharges" label="Windscreen Charges / 挡风玻璃费用"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
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
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.filter((vehicle) => vehicle.customerId || vehicle.id === selectedEditPayment?.vehicleId).map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="nettPrice" label="Nett Price"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Pending", "Approved", "Disbursed", "Reconciled"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="receiptNumber" label="Receipt No."><Input placeholder="RCPT-1001" /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice No."><Input placeholder="INV-1001" /></Form.Item>
          <Descriptions size="small" column={1} className="fullWidth">
            <Descriptions.Item label="Management Review / 管理层审核">{selectedEditPayment?.bossChecked ? "Reviewed" : "Pending"}</Descriptions.Item>
          </Descriptions>
          {canApproveManagementReview && selectedEditPayment && !selectedEditPayment.bossChecked && <Button onClick={() => onApproveManagementReview(selectedEditPayment.id)}>Approve Management Review</Button>}
          <Form.Item name="documentsPrepared" label="Prepare Document"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="checklistValidated" label="Checklist Validation"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="salesPrice" label="Sales Price / 销售价格"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          <Form.Item name="interestAdditionalCharges" label="Interest + Additional Charges / 利息与增加项"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          <Form.Item name="ncdAmount" label={shortformLabel("NCD / 无索偿折扣", "No claim discount")}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          <Form.Item name="windscreenCharges" label="Windscreen Charges / 挡风玻璃费用"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
          <Descriptions size="small" column={1} className="fullWidth">
            <Descriptions.Item label="Outstation Delivery Date / 外地送车日期">
              {selectedEditPayment?.outstationDeliveryDate || "Set in Delivery Workboard"}
            </Descriptions.Item>
          </Descriptions>
          <Form.Item name="bankName" label="Bank"><Input placeholder="Maybank" /></Form.Item>
          <Form.Item name="bankFollowUpDate" label="Bank Follow-up"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditPayment}>Update Payment</Button></Form.Item>
        </Form>
      </Drawer>
      {financeTab === "payments" && <ProCard title="Finance Documents / 财务文件">
        <Space direction="vertical" size={12} className="fullWidth">
          {selectedPayment && !isFinanceV2(selectedPayment) && <MissingUploadReminder
            title="Payment evidence required"
            description="Attach the receipt or invoice to this collection record before finance reconciliation."
            items={financeDocumentCategories.map((category) => ({
              label: documentCategoryLabel(category),
              isPresent: paymentDocuments.some((document) => document.category === category)
            }))}
            onAction={() => setDocumentCategory(financeDocumentCategories.find((category) => !paymentDocuments.some((document) => document.category === category)) ?? "PaymentReceipt")}
          />}
          {selectedPayment && isFinanceV2(selectedPayment) && <Alert type="info" showIcon message="Attach evidence to the matching partial payment before reconciliation." action={<Button size="small" onClick={() => openV2Details(selectedPayment.id)}>Open payment history</Button>} />}
          <Form layout="vertical" className="formGrid">
            <Form.Item label="Payment Record / 收款记录">
              <Select
                value={selectedPayment?.id}
                onChange={(paymentId) => {
                  setUploadPaymentId(paymentId);
                  if (isFinanceV2(payments.find((payment) => payment.id === paymentId) ?? payments[0])) setDocumentCategory("PaymentReceipt");
                }}
                options={payments.map((payment) => ({
                  value: payment.id,
                  label: `${plateFor(vehicles, payment.vehicleId)} / ${payment.receiptNumber || "No receipt"} / ${payment.invoiceNumber || "No invoice"}`
                }))}
              />
            </Form.Item>
            {selectedPayment && !isFinanceV2(selectedPayment) && <>
            <Form.Item label="Document Type / 文件类型">
              <Select<DocumentCategory>
                value={documentCategory}
                onChange={setDocumentCategory}
                options={financeDocumentCategories.map((category) => ({ value: category, label: documentCategoryLabel(category) }))}
              />
            </Form.Item>
            <Form.Item label="Receipt / Invoice Upload / 收据与发票上传">
              <OcrUploadReview
                vehicleId={selectedPayment.vehicleId}
                category={documentCategory}
                uploadOwner={{ paymentRecordId: selectedPayment.id }}
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
                  setEditPaymentId(selectedPayment.id);
                  setPaymentOcrDraft(values);
                  setFinanceEditorOpen("payment");
                }}
                onUploaded={() => setDocumentReloadKey((value) => value + 1)}
              />
            </Form.Item>
            </>}
          </Form>
          <Alert
            type="info"
            showIcon
            message={selectedPayment && isFinanceV2(selectedPayment)
              ? "V2 evidence is attached from Payment history so each file stays linked to the correct partial payment."
              : "Upload payment evidence against the linked sale for finance audit. / 上传付款证据供财务审核。"}
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
            <Descriptions.Item label="Outstanding Bank Collection">{formatMoney(outstanding)}</Descriptions.Item>
            <Descriptions.Item label="Outstanding Settlement">{formatMoney(settlementOutstanding)}</Descriptions.Item>
            <Descriptions.Item label="Daily Spend Due">{formatMoney(dailySpendOutstanding)}</Descriptions.Item>
            <Descriptions.Item label="Broker Commission Due">{formatMoney(brokerCommissionOutstanding)}</Descriptions.Item>
            <Descriptions.Item label="Debt Recovery Balance">{formatMoney(debtOutstanding)}</Descriptions.Item>
            <Descriptions.Item label="Payment Voucher Open">{formatMoney(voucherOutstanding)}</Descriptions.Item>
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
                  <span><small>Amount / 金额</small><strong>{formatMoney(settlement.amount)}</strong></span>
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
          <OperationsProTable className="desktopDataTable" rowKey="id" columns={settlementColumns} dataSource={filteredSettlements} pagination={tablePagination(filteredSettlements.length, settlementPage, setFinancePage)} scroll={{ x: 640 }} locale={{ emptyText: settlementEmptyText }} />
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
            <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="ownerId" label="Settlement Owner / Previous Owner"><Select allowClear showSearch optionFilterProp="label" options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} /></Form.Item>
            <Form.Item name="amount" label="Settlement Amount" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
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
            <Form.Item name="id" label="Selected Settlement"><Select options={settlements.map((settlement) => ({ value: settlement.id, label: `${plateFor(vehicles, settlement.vehicleId)} / ${formatMoney(settlement.amount)} / ${settlement.deadline}` }))} onChange={selectSettlement} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="ownerId" label="Settlement Owner / Previous Owner"><Select allowClear showSearch optionFilterProp="label" options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} /></Form.Item>
            <Form.Item name="amount" label="Settlement Amount" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
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
                  <span><small>Commission / 佣金</small><strong>{formatMoney(commission.amount)}</strong></span>
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
          <OperationsProTable className="desktopDataTable" rowKey="id" columns={brokerCommissionColumns} dataSource={filteredBrokerCommissions} pagination={tablePagination(filteredBrokerCommissions.length, brokerCommissionPage, setFinancePage)} scroll={{ x: 760 }} locale={{ emptyText: brokerCommissionEmptyText }} />
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
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="brokerName" label="Broker / 经纪人" rules={[{ required: true }]}><Input placeholder="Broker name" /></Form.Item>
            <Form.Item name="amount" label="Commission / 佣金" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
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
            <Form.Item name="id" label="Selected Broker Commission"><Select options={brokerCommissions.map((commission) => ({ value: commission.id, label: `${plateFor(vehicles, commission.vehicleId)} / ${commission.brokerName} / ${formatMoney(commission.amount)}` }))} onChange={selectBrokerCommission} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="brokerName" label="Broker / 经纪人" rules={[{ required: true }]}><Input placeholder="Broker name" /></Form.Item>
            <Form.Item name="amount" label="Commission / 佣金" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
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
                  <span><small>Balance / 欠款</small><strong>{formatMoney(debt.balanceAmount)}</strong></span>
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
          <OperationsProTable className="desktopDataTable" rowKey="id" columns={debtRecoveryColumns} dataSource={filteredDebtRecoveries} pagination={tablePagination(filteredDebtRecoveries.length, debtRecoveryPage, setFinancePage)} scroll={{ x: 960 }} locale={{ emptyText: debtRecoveryEmptyText }} />
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
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="customerId" label="Customer / 客户" rules={[{ required: true }]}><Select options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} /></Form.Item>
            <Form.Item name="balanceAmount" label="Balance / 欠款" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
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
            <Form.Item name="id" label="Selected Debt Case"><Select options={debtRecoveries.map((debt) => ({ value: debt.id, label: `${plateFor(vehicles, debt.vehicleId)} / ${customerLabel(customers, debt.customerId)} / ${formatMoney(debt.balanceAmount)}` }))} onChange={selectDebtRecovery} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="customerId" label="Customer / 客户" rules={[{ required: true }]}><Select options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} /></Form.Item>
            <Form.Item name="balanceAmount" label="Balance / 欠款" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="followUpDate" label="Follow-up Date / 跟进日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="status" label="Status / 状态"><Select options={["Open", "FollowedUp", "Closed"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Balance reminder note" /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditDebtRecovery}>Update Debt Case</Button></Form.Item>
          </Form>
      </Drawer>
      {financeTab === "vouchers" && <ProCard title="Supplier master approval / 供应商审核">
        <Alert className="sectionIntroAlert" type="info" showIcon message="Approve complete supplier records before they are used for purchase accounting." />
        <OperationsProTable<Supplier>
          rowKey="id"
          dataSource={supplierMaster}
          pagination={false}
          columns={[
            { title: "Company", dataIndex: "companyName" },
            { title: "Phone", dataIndex: "phone" },
            { title: "Address", dataIndex: "address" },
            { title: "TIN", dataIndex: "tinNumber", render: (value) => value || "-" },
            { title: "Creditor code", dataIndex: "autoCountCreditorCode", render: (value) => value || "Auto-create" },
            { title: "Status", dataIndex: "approvalStatus", render: (value) => <Tag color={value === "Approved" ? "green" : "gold"}>{value}</Tag> },
            { title: "Action", render: (_, supplier) => supplier.approvalStatus === "Draft" ? <Button size="small" onClick={async () => { try { await approveSupplier(supplier.id); message.success("Supplier approved."); await reloadSupplierMaster(); } catch (error) { message.error(humanizeApiError(error, "Unable to approve supplier.")); } }}>Approve</Button> : null }
          ]}
        />
      </ProCard>}
      {financeTab === "vouchers" && <ProCard title="Purchase invoice accounting review / 收车发票审核">
        <Alert className="sectionIntroAlert" type="info" showIcon message="Confirm the invoice date and classified fee lines before AutoCount export." />
        <OperationsProTable<PurchaseInvoice>
          rowKey="id"
          dataSource={purchaseInvoices}
          pagination={false}
          columns={[
            { title: "Car Plate", render: (_, invoice) => plateFor(vehicles, invoice.vehicleId) },
            { title: "Invoice", dataIndex: "invoiceNumber" },
            { title: "Invoice date", dataIndex: "invoiceDate" },
            { title: "Lines", render: (_, invoice) => (invoice.lines ?? []).map((line) => line.lineType).join(", ") || "-" },
            { title: "Amount", dataIndex: "amount", render: (value) => formatMoney(Number(value)) },
            { title: "Status", dataIndex: "accountingStatus", render: (value) => <Tag color={value === "FinanceConfirmed" ? "green" : "gold"}>{value === "FinanceConfirmed" ? "Confirmed" : "Draft"}</Tag> },
            { title: "Action", render: (_, invoice) => invoice.accountingStatus !== "FinanceConfirmed" ? <Button size="small" onClick={async () => { try { await confirmPurchaseInvoiceAccounting(invoice.id); message.success("Purchase invoice accounting confirmed."); await reloadPurchaseInvoices(); } catch (error) { message.error(humanizeApiError(error, "Unable to confirm purchase invoice.")); } }}>Confirm</Button> : null }
          ]}
        />
      </ProCard>}
      {financeTab === "vouchers" && <ProCard title="Delivery accounting review / 出车会计审核">
        <Alert className="sectionIntroAlert" type="info" showIcon message="Confirm delivery-entered insurance and road-tax drafts before they are eligible for AutoCount review." />
        <OperationsProTable<DeliveryAccountingCharge>
          rowKey="id"
          dataSource={deliveryAccountingCharges}
          pagination={false}
          columns={[
            { title: "Car Plate", render: (_, charge) => plateFor(vehicles, charge.vehicleId) },
            { title: "Type", dataIndex: "chargeType" },
            { title: "Provider", dataIndex: "providerName" },
            { title: "Invoice date", dataIndex: "invoiceDate" },
            { title: "Amount", dataIndex: "amount", render: (value) => formatMoney(Number(value)) },
            { title: "Status", dataIndex: "accountingStatus", render: (value) => <Tag color={value === "FinanceConfirmed" ? "green" : "gold"}>{value === "FinanceConfirmed" ? "Confirmed" : "Draft"}</Tag> },
            { title: "Action", render: (_, charge) => charge.accountingStatus === "Draft" ? <Button size="small" onClick={async () => { try { await confirmDeliveryAccountingCharge(charge.id); message.success("Delivery accounting detail confirmed."); await reloadDeliveryAccountingCharges(); } catch (error) { message.error(humanizeApiError(error, "Unable to confirm delivery accounting detail.")); } }}>Confirm</Button> : null }
          ]}
        />
      </ProCard>}
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
                  <span><small>Amount / 金额</small><strong>{formatMoney(voucher.amount)}</strong></span>
                </div>
                <div className="mobileRecordSection">
                  <Typography.Text className="mobileRecordLabel">Purpose / 用途</Typography.Text>
                  <div className="mobileRecordTextBlock"><span>{voucher.purpose}</span></div>
                </div>
                <div className="mobileRecordFooter">
                  <Tag>Issued: {voucher.issuedDate}</Tag>
                  <Space wrap>
                    <Button size="small" type="primary" onClick={() => selectPaymentVoucher(voucher.id)}>Details</Button>
                    {voucher.status === "Pending" && <Button size="small" onClick={() => onApprovePaymentVoucher(voucher.id)}>Approve</Button>}
                    {voucher.status === "Approved" && <Button size="small" onClick={() => confirmMarkVoucherPaid(voucher)}>Mark paid</Button>}
                  </Space>
                </div>
              </article>
            ))}
            <Pagination className="mobileRecordPagination" current={paymentVoucherPage} pageSize={FINANCE_LIST_PAGE_SIZE} total={filteredPaymentVouchers.length} showSizeChanger={false} hideOnSinglePage onChange={setFinancePage} />
          </div>
          <OperationsProTable className="desktopDataTable" rowKey="id" columns={paymentVoucherColumns} dataSource={filteredPaymentVouchers} pagination={tablePagination(filteredPaymentVouchers.length, paymentVoucherPage, setFinancePage)} scroll={{ x: 960 }} locale={{ emptyText: paymentVoucherEmptyText }} />
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
              status: "Pending",
              issuedDate: values.issuedDate,
              paymentMethod: values.paymentMethod,
              sourceAccountCode: values.sourceAccountCode,
              chequeNumber: values.chequeNumber?.trim() || undefined,
              paymentReference: values.paymentReference?.trim() || undefined,
              bankChargeAmount: Number(values.bankChargeAmount ?? 0),
              bankChargeAccountCode: values.bankChargeAccountCode?.trim() || undefined,
              accountingAccountCode: values.accountingAccountCode,
              notes: values.notes
            };
            const blockReason = paymentVoucherCreateBlockReason(voucher, vehicles);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreatePaymentVoucher(voucher);
            setFinanceCreateOpen(null);
          }} initialValues={{ vehicleId: vehicles[0]?.id, purpose: "Outstation Pickup Allowance", status: "Pending", issuedDate: today(), paymentMethod: "BankTransfer", bankChargeAmount: 0 }}>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="payeeName" label="Payee / 收款人" rules={[{ required: true }]}><Input placeholder="Driver / staff name" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="purpose" label="Purpose / 用途" rules={[{ required: true }]}><Input placeholder="Outstation Pickup Allowance" /></Form.Item>
            <Form.Item name="issuedDate" label="Issued Date / 日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="paymentMethod" label="Payment method" rules={[{ required: true }]}><Select options={["BankTransfer", "Cheque", "Cash", "Other"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="sourceAccountCode" label="Bank / cash source account" rules={[{ required: true }]}><Input placeholder="AutoCount bank or cash account" /></Form.Item>
            <Form.Item noStyle shouldUpdate={(previous, current) => previous.paymentMethod !== current.paymentMethod}>{({ getFieldValue }) => getFieldValue("paymentMethod") === "Cheque" ? <Form.Item name="chequeNumber" label="Cheque number" rules={[{ required: true }]}><Input /></Form.Item> : <Form.Item name="paymentReference" label="Transfer / payment reference"><Input /></Form.Item>}</Form.Item>
            <Form.Item name="accountingAccountCode" label="Accounting account" rules={[{ required: true }]} extra="Loan application fee follows the approved mapping 8000-L002."><Input /></Form.Item>
            <Form.Item name="bankChargeAmount" label="Bank charge"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item noStyle shouldUpdate={(previous, current) => previous.bankChargeAmount !== current.bankChargeAmount}>{({ getFieldValue }) => Number(getFieldValue("bankChargeAmount") ?? 0) > 0 ? <Form.Item name="bankChargeAccountCode" label="Bank charge account" rules={[{ required: true }]}><Input /></Form.Item> : null}</Form.Item>
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
                issuedDate: values.issuedDate,
                paymentMethod: values.paymentMethod,
                sourceAccountCode: values.sourceAccountCode,
                chequeNumber: values.chequeNumber?.trim() || undefined,
                paymentReference: values.paymentReference?.trim() || undefined,
                bankChargeAmount: Number(values.bankChargeAmount ?? 0),
                bankChargeAccountCode: values.bankChargeAccountCode?.trim() || undefined,
                accountingAccountCode: values.accountingAccountCode,
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
            <Form.Item name="id" label="Selected Voucher"><Select options={paymentVouchers.map((voucher) => ({ value: voucher.id, label: `${plateFor(vehicles, voucher.vehicleId)} / ${voucher.payeeName} / ${formatMoney(voucher.amount)}` }))} onChange={selectPaymentVoucher} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="payeeName" label="Payee / 收款人" rules={[{ required: true }]}><Input placeholder="Driver / staff name" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="purpose" label="Purpose / 用途" rules={[{ required: true }]}><Input placeholder="Outstation Pickup Allowance" /></Form.Item>
            <Form.Item name="issuedDate" label="Issued Date / 日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item label="Workflow status"><Tag>{selectedEditPaymentVoucher?.status}</Tag></Form.Item>
            <Form.Item name="paymentMethod" label="Payment method" rules={[{ required: true }]}><Select options={["BankTransfer", "Cheque", "Cash", "Other"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="sourceAccountCode" label="Bank / cash source account" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="chequeNumber" label="Cheque number"><Input /></Form.Item>
            <Form.Item name="paymentReference" label="Transfer / payment reference"><Input /></Form.Item>
            <Form.Item name="accountingAccountCode" label="Accounting account" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="bankChargeAmount" label="Bank charge"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="bankChargeAccountCode" label="Bank charge account"><Input /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Booking slip / salary voucher reference" /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditPaymentVoucher || selectedEditPaymentVoucher.status !== "Pending"}>Update pending voucher</Button></Form.Item>
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
                  <span><small>Amount / 金额</small><strong>{formatMoney(spend.amount)}</strong></span>
                  <span><small>Due / 到期</small><strong>{spend.dueDate}</strong></span>
                </div>
                <div className="mobileRecordFooter">
                  <Space className="tableActionGroup" wrap size={6}>
                    <Button size="small" type="primary" onClick={() => selectDailySpend(spend.id)}>Details</Button>
                    <Button size="small" onClick={() => onUpdateDailySpend(payDailySpend(spend))} disabled={spend.isPaid}>Pay</Button>
                    <Button size="small" onClick={() => onUpdateDailySpend({ ...spend, isPaid: false })} disabled={!canReopenPaidDailySpend(spend)}>Reopen</Button>
                  </Space>
                </div>
              </article>
            ))}
            <Pagination className="mobileRecordPagination" current={dailySpendPage} pageSize={FINANCE_LIST_PAGE_SIZE} total={filteredDailySpends.length} showSizeChanger={false} hideOnSinglePage onChange={setFinancePage} />
          </div>
          <OperationsProTable className="desktopDataTable" rowKey="id" columns={dailySpendColumns} dataSource={filteredDailySpends} pagination={tablePagination(filteredDailySpends.length, dailySpendPage, setFinancePage)} scroll={{ x: 640 }} locale={{ emptyText: dailySpendEmptyText }} />
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
            const spend = createUnpaidDailySpend(
              newId(),
              values.description,
              Number(values.amount ?? 0),
              values.dueDate.format("YYYY-MM-DD")
            );
            const blockReason = dailySpendCreateBlockReason(spend);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreateDailySpend(spend);
            setFinanceCreateOpen(null);
          }} initialValues={{ description: "Electric Bill", dueDate: dayjs(monthlyElectricBillDueDate()) }}>
            <Form.Item name="description" label="Description / 项目" rules={[{ required: true }]}><Input placeholder="Electric Bill" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0.01} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="dueDate" label="Due Date / 到期日" rules={[{ required: true }]}><DatePicker className="fullWidth" format="DD MMM YYYY" /></Form.Item>
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
            <Form.Item name="id" label="Selected Daily Spend"><Select options={dailySpends.map((spend) => ({ value: spend.id, label: `${spend.description} / ${formatMoney(spend.amount)} / ${spend.dueDate}` }))} onChange={selectDailySpend} /></Form.Item>
            <Form.Item name="description" label="Description / 项目" rules={[{ required: true }]}><Input placeholder="Electric Bill" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="dueDate" label="Due Date / 到期日" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="isPaid" label="Status / 状态"><Select options={[{ value: false, label: "Due" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditDailySpend}>Update Daily Spend</Button></Form.Item>
          </Form>
      </Drawer>
    </Space>
  );
}

export function FinanceV2BalanceSummary({ payment, vehicles, customers }: { payment: PaymentRecord; vehicles: VehicleLookup[]; customers: Customer[] }) {
  return (
    <section className="financeV2BalanceSummary">
      <div className="financeV2BalanceHeader">
        <div>
          <Typography.Text type="secondary">{plateFor(vehicles, payment.vehicleId)}</Typography.Text>
          <Typography.Title level={4}>{customerLabel(customers, payment.customerId ?? vehicles.find((vehicle) => vehicle.id === payment.vehicleId)?.customerId)}</Typography.Title>
        </div>
        <Tag color={receivableStatusColor(payment.receivableStatus)}>{receivableStatusLabel(payment.receivableStatus)}</Tag>
      </div>
      <div className="financeV2BalanceGrid">
        <span><small>Invoice total</small><strong>{formatMoney(payment.invoice?.amount ?? payment.nettPrice)}</strong></span>
        <span><small>Collected</small><strong>{formatMoney(payment.collectedAmount ?? 0)}</strong></span>
        <span><small>Balance due</small><strong>{formatMoney(payment.balanceAmount ?? payment.nettPrice)}</strong></span>
      </div>
    </section>
  );
}

const collectionMethodOptions: Array<{ value: Exclude<CollectionMethod, "Cash">; label: string }> = [
  { value: "BookingDeposit", label: "Booking deposit" },
  { value: "DownPayment", label: "Down payment" },
  { value: "BankTransfer", label: "Bank transfer" },
  { value: "BankDisbursement", label: "Bank financing disbursement" },
  { value: "Cheque", label: "Cheque" },
  { value: "Card", label: "Card" },
  { value: "TradeInCredit", label: "Trade-in credit" },
  { value: "Other", label: "Other non-cash payment" }
];

function collectionMethodLabel(method: CollectionMethod) {
  return ({ BookingDeposit: "Booking deposit", DownPayment: "Down payment", BankTransfer: "Bank transfer", BankDisbursement: "Bank financing disbursement", Cheque: "Cheque", Card: "Card", TradeInCredit: "Trade-in credit", Other: "Other", Cash: "Cash custody" } satisfies Record<CollectionMethod, string>)[method];
}

function collectionStatusLabel(status: CollectionTransaction["status"]) {
  return ({ Pending: "Pending reconciliation", Reconciled: "Reconciled", Reversed: "Reversed" })[status];
}

function financingStatusLabel(status: FinancingStatus) {
  return ({ NotApplicable: "Not applicable", Pending: "Pending bank approval", Approved: "Approved", Disbursed: "Disbursed" })[status];
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

function matchesDashboardFinanceFocus(focus: DashboardDrilldown, vehicleId: string | undefined, matchesAttention = true) {
  return (!focus.vehicleId || focus.vehicleId === vehicleId) && matchesAttention;
}

function plateFor(vehicles: VehicleLookup[], vehicleId: string) {
  return vehicles.find((vehicle) => vehicle.id === vehicleId)?.plateNumber ?? "Unknown";
}

function customerLabel(customers: Customer[], customerId?: string) {
  if (!customerId) return "Unknown";
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

function statusOptionsForFinanceTab(tab: string) {
  const labels = tab === "payments"
    ? ["WaitingForApproval", "ReadyToCollect", "PartiallyPaid", "Paid", "AttentionNeeded", "Pending", "Approved", "Disbursed", "Reconciled"]
    : tab === "settlements" || tab === "daily"
      ? ["Due", "Paid"]
      : tab === "commissions"
        ? ["Unpaid", "Paid"]
        : tab === "debt"
          ? ["Open", "FollowedUp", "Closed"]
          : tab === "vouchers"
            ? ["Pending", "Approved", "Paid"]
            : [];

  return labels.map((value) => ({
    label: ["WaitingForApproval", "ReadyToCollect", "PartiallyPaid", "Paid", "AttentionNeeded"].includes(value)
      ? receivableStatusLabel(value as PaymentRecord["receivableStatus"])
      : financeStatusLabel(value),
    value
  }));
}

function addCalendarDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
