import { useEffect, useMemo, useState } from "react";
import { ProCard } from "@ant-design/pro-components";
import { Alert, Button, Descriptions, Empty, Form, Input, InputNumber, Modal, Pagination, Select, Space, Tag, Timeline, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { OperationsProTable, operationsKeywordFromFields } from "../shared/OperationsProTable";
import { FINANCE_LIST_PAGE_SIZE, financeEmptyText, financePageFor, pageFinanceRows } from "./financeList";
import { formatMoney, formatMoneyInput, parseMoneyInput } from "../../money";
import {
  officialReceiptContentUrl,
  type CashHandover,
  type CashHandoverPaymentLookup,
  type CurrentUser,
  type Customer
} from "../../api";

export type CashCustodyStatusFilter = CashHandover["status"] | "All" | "Overdue" | "AmountMismatch";
type CustodyAction = "request" | "record" | "accept";

export function filterCashHandovers(
  handovers: CashHandover[],
  paymentLookup: CashHandoverPaymentLookup[],
  keyword: string,
  status: CashCustodyStatusFilter
) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const compactKeyword = compactSearchValue(normalizedKeyword);

  return handovers.filter((handover) => {
    const payment = paymentLookup.find((item) => item.paymentRecordId === handover.paymentRecordId);
    const matchesKeyword = !normalizedKeyword || [
      handover.plateNumber,
      handover.customerName,
      handover.paymentInvoiceNumber,
      payment?.plateNumber,
      payment?.customerName,
      payment?.invoiceNumber,
      handover.paymentRecordId,
      handover.collectionTransactionId,
      handover.officialReceiptNumber,
      handover.collectedByUserId,
      statusLabel(handover.status)
    ].some((value) => {
      const normalizedValue = value?.toLowerCase() ?? "";
      return normalizedValue.includes(normalizedKeyword)
        || (Boolean(compactKeyword) && compactSearchValue(normalizedValue).includes(compactKeyword));
    });
    const matchesStatus = status === "All"
      || (status === "Overdue" ? isOverdue(handover) : status === "AmountMismatch" ? !handover.transactionMatches : handover.status === status);

    return matchesKeyword && matchesStatus;
  });
}

export function CashCustodyPage({
  currentUser,
  customers,
  handovers,
  paymentLookup,
  focusCollectionId,
  prefillPaymentId,
  loadError,
  onRetry,
  onCreate,
  onRequestHandover,
  onRecordHandover,
  onAccept,
  onReject
}: {
  currentUser: CurrentUser | null;
  customers: Customer[];
  handovers: CashHandover[];
  paymentLookup: CashHandoverPaymentLookup[];
  focusCollectionId?: string;
  prefillPaymentId?: string;
  loadError: string | null;
  onRetry: () => Promise<void>;
  onCreate: (paymentRecordId: string, amount: number, notes?: string, idempotencyKey?: string) => Promise<void>;
  onRequestHandover: (id: string) => Promise<void>;
  onRecordHandover: (id: string) => Promise<void>;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<{ payment: CashHandoverPaymentLookup; amount: number; notes?: string; idempotencyKey: string } | null>(null);
  const [reviewing, setReviewing] = useState<{ action: CustodyAction; handover: CashHandover } | null>(null);
  const [viewing, setViewing] = useState<CashHandover | null>(null);
  const [rejecting, setRejecting] = useState<CashHandover | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<CashCustodyStatusFilter>();
  const [page, setPage] = useState(1);
  const [createForm] = Form.useForm<{ paymentRecordId: string; amount: number; notes?: string }>();
  const [rejectForm] = Form.useForm<{ reason: string }>();
  const selectedPaymentId = Form.useWatch("paymentRecordId", createForm);
  const selectedPayment = paymentLookup.find((item) => item.paymentRecordId === selectedPaymentId);
  const isFinance = currentUser?.roles.some((role) => role === "BossAdmin" || role === "Finance") ?? false;
  const isSales = currentUser?.roles.some((role) => role === "BossAdmin" || role === "Sales") ?? false;
  const currentUserId = currentUser?.id;
  const availablePayments = paymentLookup;
  const overdueCount = handovers.filter(isOverdue).length;
  const mismatchCount = handovers.filter((handover) => !handover.transactionMatches).length;
  const filteredHandovers = useMemo(() => filterCashHandovers(handovers, paymentLookup, keyword, status ?? "All"), [handovers, keyword, paymentLookup, status]);
  const custodyPage = financePageFor(filteredHandovers.length, page);
  const visibleHandovers = pageFinanceRows(filteredHandovers, custodyPage);
  const custodyFiltersActive = Boolean(keyword.trim() || status);
  const custodyEmptyText = financeEmptyText(handovers.length, filteredHandovers.length, "cash handovers");

  useEffect(() => {
    if (!focusCollectionId) return;
    setKeyword(focusCollectionId);
    setStatus(undefined);
    setPage(1);
  }, [focusCollectionId]);

  useEffect(() => {
    const action = cashCustodyPrefillAction(isSales, Boolean(prefillPaymentId && paymentLookup.some((payment) => payment.paymentRecordId === prefillPaymentId)));
    if (!prefillPaymentId || action === "none") return;
    if (action === "open-create") {
      createForm.setFieldValue("paymentRecordId", prefillPaymentId);
      setCreateOpen(true);
      return;
    }
    setKeyword(prefillPaymentId);
    setStatus(undefined);
    setPage(1);
  }, [createForm, isSales, paymentLookup, prefillPaymentId]);

  const renderHandoverActions = (handover: CashHandover) => (
    <Space direction="vertical" size={4}>
    <Space className="tableActionGroup" wrap size={6}>
      <Button size="small" onClick={() => setViewing(handover)}>View details</Button>
      {isSales && currentUserId === handover.collectedByUserId && handover.status === "ReceivedBySales" && (
        <Button size="small" type="primary" disabled={Boolean(loadError)} onClick={() => setReviewing({ action: "request", handover })}>Review Handover Request</Button>
      )}
      {isFinance && handover.status === "PendingHandover" && (
        <Tooltip title={custodyActionBlockReason("record", handover, currentUserId)}><span><Button size="small" type="primary" disabled={Boolean(loadError || custodyActionBlockReason("record", handover, currentUserId))} onClick={() => setReviewing({ action: "record", handover })}>Review Cash Receipt</Button></span></Tooltip>
      )}
      {isFinance && handover.status === "HandedOver" && (
        <>
          <Tooltip title={custodyActionBlockReason("accept", handover, currentUserId)}><span><Button size="small" type="primary" disabled={Boolean(loadError || custodyActionBlockReason("accept", handover, currentUserId))} onClick={() => setReviewing({ action: "accept", handover })}>Review & Accept</Button></span></Tooltip>
          {handover.canRejectTransaction && <Tooltip title={custodyDecisionBlockReason(handover, currentUserId)}><span><Button size="small" danger disabled={Boolean(loadError || custodyDecisionBlockReason(handover, currentUserId))} onClick={() => { rejectForm.resetFields(); setRejecting(handover); }}>Review & Reject</Button></span></Tooltip>}
        </>
      )}
    </Space>
    {visibleBlockReason(handover, isFinance, currentUserId) && <Typography.Text type="danger">{visibleBlockReason(handover, isFinance, currentUserId)}</Typography.Text>}
    </Space>
  );

  const columns: ColumnsType<CashHandover> = [
    {
      title: "Transaction / 交易",
      render: (_, handover) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{handover.plateNumber} / {handover.customerName}</Typography.Text>
          <Typography.Text type="secondary">Collector: {handover.collectedByName || handover.collectedByUserId}</Typography.Text>
        </Space>
      )
    },
    { title: "Amount / 金额", render: (_, handover) => <Space direction="vertical" size={2}><Typography.Text strong>{formatMoney(handover.amount)}</Typography.Text>{handover.collectionTransactionId && <Tag color="blue">Finance V2 partial cash</Tag>}{!handover.transactionMatches && <Tag color="red">Transaction mismatch</Tag>}</Space> },
    {
      title: "Status / 状态",
      render: (_, handover) => (
        <Space wrap size={4}>
          <Tag color={statusColor(handover.status)}>{statusLabel(handover.status)}</Tag>
          {isOverdue(handover) && <Tag color="red">Overdue</Tag>}
          {!handover.transactionMatches && <Tag color="red">Mismatch</Tag>}
        </Space>
      )
    },
    { title: "Payment / 对账", render: (_, handover) => <Space direction="vertical" size={2}><Tag color={handover.collectionStatus === "Reconciled" || handover.paymentStatus === "Reconciled" ? "green" : handover.collectionStatus === "Reversed" ? "red" : "orange"}>{handover.collectionStatus ?? handover.paymentStatus ?? "Unavailable"}</Tag><Typography.Text type="secondary">{formatDateTime(handover.collectedAt)}</Typography.Text></Space> },
    {
      title: "Receipt / 收据",
      render: (_, handover) => handover.officialReceiptNumber ? (
        <Space wrap>
          <Tag color="green">{handover.officialReceiptNumber}</Tag>
          <Button size="small" href={officialReceiptContentUrl(handover.id)} target="_blank">Download</Button>
          <Button size="small" onClick={() => composeReceiptEmail(handover, customers)}>Compose Email</Button>
        </Space>
      ) : "-"
    },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 270,
      render: (_, handover) => renderHandoverActions(handover)
    }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard
        title="Cash Custody / 现金交接"
        extra={isSales ? <Button type="primary" disabled={Boolean(loadError)} onClick={() => { createForm.resetFields(); setCreateOpen(true); }}>Record Cash Received</Button> : null}
      >
        <Space direction="vertical" size={12} className="fullWidth">
          {loadError && <Alert type="error" showIcon message="Cash custody data is unavailable" description={`${loadError} Creating or changing custody is disabled until the register reloads successfully.`} action={<Button loading={retrying} onClick={async () => { setRetrying(true); try { await onRetry(); } finally { setRetrying(false); } }}>Retry</Button>} />}
          {prefillPaymentId && !isSales && <Alert type="info" showIcon message="The assigned Sales user must record this physical cash" description="Your payment context is retained below. Finance can review an existing custody record, but only the assigned Sales user can start a new cash custody record." />}
          <Alert type="warning" showIcon message="Sales records physical cash. Finance confirms receipt, and a different Finance or Boss/Admin checker accepts or rejects custody. Finance V2 cash updates the invoice only after acceptance." />
          <div className="metricGrid">
            <Metric label="Open custody" value={handovers.filter((handover) => handover.status !== "Receipted" && handover.status !== "Rejected").length} />
            <Metric label="Overdue handovers" value={overdueCount} danger={overdueCount > 0} />
            <Metric label="Amount mismatches" value={mismatchCount} danger={mismatchCount > 0} />
            <Metric label="Official receipts" value={handovers.filter((handover) => Boolean(handover.officialReceiptId)).length} />
          </div>
          <Alert
            type="info"
            showIcon
            message="Download the receipt, then use Compose Email to address the customer and attach the PDF. WhatsApp dispatch will be enabled through the notification engine once FOO-40 is delivered."
          />
        </Space>
      </ProCard>

      <ProCard title="Custody Register / 交接记录">
        <Space direction="vertical" size={12} className="fullWidth">
          <Space className="financeToolbarForm pageFilterMobileOnly" wrap>
            <Input.Search
              aria-label="Search cash custody records by plate, customer, invoice, or reference"
              className="financeKeywordFilter"
              allowClear
              value={keyword}
              placeholder="Search plate, customer, invoice, or reference"
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
              }}
              onSearch={(value) => {
                setKeyword(value);
                setPage(1);
              }}
            />
            <Select
              allowClear
              aria-label="Filter cash custody records by status"
              className="financeStatusFilter"
              value={status}
              placeholder="All statuses"
              options={[
                ...(["ReceivedBySales", "PendingHandover", "HandedOver", "Rejected", "Receipted"] as CashHandover["status"][]).map((value) => ({ value, label: statusLabel(value) })),
                { value: "Overdue", label: "Overdue" },
                { value: "AmountMismatch", label: "Transaction mismatch" }
              ]}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            />
            <Tag color={custodyFiltersActive ? "blue" : undefined}>
              {custodyFiltersActive ? `${filteredHandovers.length} of ${handovers.length} matching` : `${handovers.length} record${handovers.length === 1 ? "" : "s"}`}
            </Tag>
            {custodyFiltersActive && <Button onClick={() => {
              setKeyword("");
              setStatus(undefined);
              setPage(1);
            }}>Clear filters</Button>}
          </Space>
          <div className="mobileRecordList">
            {filteredHandovers.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={custodyEmptyText} />}
            {visibleHandovers.map((handover) => (
              <article className="mobileRecordCard" key={handover.id}>
                <div className="mobileRecordHeader">
                  <div>
                    <Typography.Text className="mobileRecordEyebrow">Custody / 保管</Typography.Text>
                    <Typography.Title level={5}>{handover.plateNumber} / {handover.customerName}</Typography.Title>
                    <Typography.Text type="secondary">Collector: {handover.collectedByName || handover.collectedByUserId}</Typography.Text>
                  </div>
                  <Space direction="vertical" align="end" size={4}>
                    <Tag color={statusColor(handover.status)}>{statusLabel(handover.status)}</Tag>
                    {isOverdue(handover) && <Tag color="red">Overdue</Tag>}
                  </Space>
                </div>
                <div className="mobileRecordMeta">
                  <span><small>Amount / 金额</small><strong>{formatMoney(handover.amount)}</strong></span>
                  <span><small>Received / 收款</small><strong>{formatDateTime(handover.collectedAt)}</strong></span>
                </div>
                <div className="mobileRecordSection">
                  <Typography.Text className="mobileRecordLabel">Receipt / 收据</Typography.Text>
                  {handover.officialReceiptNumber ? (
                    <Space className="cashCustodyReceiptActions" wrap size={6}>
                      <Tag color="green">{handover.officialReceiptNumber}</Tag>
                      <Button size="small" href={officialReceiptContentUrl(handover.id)} target="_blank">Download</Button>
                      <Button size="small" onClick={() => composeReceiptEmail(handover, customers)}>Compose Email</Button>
                    </Space>
                  ) : <Typography.Text type="secondary">Not issued</Typography.Text>}
                  {!handover.transactionMatches && <Tag color="red">Transaction mismatch</Tag>}
                </div>
                <CashCustodyDetails handover={handover} />
                <div className="mobileRecordFooter">{renderHandoverActions(handover)}</div>
              </article>
            ))}
            <Pagination
              className="mobileRecordPagination"
              current={custodyPage}
              pageSize={FINANCE_LIST_PAGE_SIZE}
              total={filteredHandovers.length}
              showSizeChanger={false}
              hideOnSinglePage
              onChange={setPage}
            />
          </div>
          <OperationsProTable
            className="desktopDataTable nativeSearchDesktopOnly"
            rowKey="id"
            columns={columns}
            dataSource={filteredHandovers}
            pagination={{
              current: custodyPage,
              pageSize: FINANCE_LIST_PAGE_SIZE,
              total: filteredHandovers.length,
              showSizeChanger: false,
              onChange: setPage,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`
            }}
            nativeSearch={{
              fields: [
                { name: "plate", label: "Plate" },
                { name: "customer", label: "Customer" },
                { name: "invoice", label: "Invoice" },
                { name: "receipt", label: "Receipt" },
                { name: "status", label: "Status", options: [
                  { value: "ReceivedBySales", label: "Received by Sales" },
                  { value: "PendingHandover", label: "Pending Handover" },
                  { value: "HandedOver", label: "Handed Over" },
                  { value: "Receipted", label: "Receipted" },
                  { value: "Rejected", label: "Rejected" },
                  { value: "Overdue", label: "Overdue" },
                  { value: "AmountMismatch", label: "Amount mismatch" }
                ] }
              ],
              values: { status },
              onSubmit: (values) => {
                setKeyword(operationsKeywordFromFields(values, ["plate", "customer", "invoice", "receipt"]));
                setStatus(values.status as CashCustodyStatusFilter | undefined);
                setPage(1);
              },
              onReset: () => {
                setKeyword("");
                setStatus(undefined);
                setPage(1);
              }
            }}
            scroll={{ x: 1150 }}
            locale={{ emptyText: custodyEmptyText }}
          />
        </Space>
      </ProCard>

      <Modal
        title="Record Cash Received / 记录现金收款"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          name="cashCustodyCreate"
          form={createForm}
          layout="vertical"
          onFinish={(values) => {
            const payment = paymentLookup.find((item) => item.paymentRecordId === values.paymentRecordId);
            if (!payment) return;
            setCreateDraft({ payment, amount: Number(values.amount), notes: values.notes?.trim() || undefined, idempotencyKey: crypto.randomUUID() });
            setCreateOpen(false);
          }}
        >
          <Form.Item name="paymentRecordId" label="Payment / Vehicle / Customer" rules={[{ required: true }]}> 
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select payment"
              options={availablePayments.map((payment) => ({
                value: payment.paymentRecordId,
                label: `${payment.plateNumber} / ${payment.customerName} / ${payment.invoiceNumber || "No invoice"} / ${payment.financeWorkflowVersion === 2 ? `${formatMoney(payment.availableAmount)} available` : formatMoney(payment.nettPrice)}`
              }))}
              onChange={(paymentRecordId) => {
                const payment = paymentLookup.find((item) => item.paymentRecordId === paymentRecordId);
                if (payment) createForm.setFieldValue("amount", payment.availableAmount);
              }}
            />
          </Form.Item>
          {selectedPayment && <Alert type="info" showIcon message={selectedPayment.financeWorkflowVersion === 2 ? "Finance V2 partial cash collection" : "Legacy full-payment cash record"} description={selectedPayment.financeWorkflowVersion === 2 ? `${formatMoney(selectedPayment.availableAmount)} remains available to allocate. Enter the actual cash received, up to this amount.` : `The cash amount must exactly match ${formatMoney(selectedPayment.nettPrice)}.`} />}
          <Form.Item name="amount" label="Cash Amount" rules={[{ required: true }]}>
            <InputNumber className="fullWidth" min={0.01} max={selectedPayment?.availableAmount} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} />
          </Form.Item>
          <Form.Item name="notes" label="Collection Notes"><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
          <Form.Item>
            <Space>
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">Review Cash Received</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Confirm Cash Received from Customer"
        open={Boolean(createDraft)}
        onCancel={() => { setCreateDraft(null); setCreateOpen(true); }}
        cancelText="Back to edit"
        okText="Confirm & Save Cash Received"
        confirmLoading={submitting}
        okButtonProps={{ disabled: Boolean(createDraft && createDraft.payment.financeWorkflowVersion !== 2 && createDraft.amount !== createDraft.payment.nettPrice) }}
        onOk={async () => {
          if (!createDraft) return;
          setSubmitting(true);
          try {
            await onCreate(createDraft.payment.paymentRecordId, createDraft.amount, createDraft.notes, createDraft.idempotencyKey);
            setCreateDraft(null);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {createDraft && <Space direction="vertical" size={12} className="fullWidth">
          {createDraft.payment.financeWorkflowVersion !== 2 && createDraft.amount !== createDraft.payment.nettPrice && <Alert type="error" showIcon message="Legacy cash amount must match the payment total" />}
          <Descriptions bordered size="small" column={1} items={[
            { key: "transaction", label: "Transaction", children: `${createDraft.payment.plateNumber} / ${createDraft.payment.customerName}` },
            { key: "invoice", label: "Invoice", children: createDraft.payment.invoiceNumber || "Legacy payment" },
            { key: "amount", label: "Actual cash received", children: formatMoney(createDraft.amount) },
            { key: "available", label: createDraft.payment.financeWorkflowVersion === 2 ? "Available before this cash" : "Expected payment total", children: formatMoney(createDraft.payment.availableAmount) },
            ...(createDraft.payment.financeWorkflowVersion === 2 ? [{ key: "remaining", label: "Remaining available after this cash", children: formatMoney(createDraft.payment.availableAmount - createDraft.amount) }] : []),
            { key: "notes", label: "Notes", children: createDraft.notes || "-" }
          ]} />
        </Space>}
      </Modal>

      <Modal title="Cash Custody Details" open={Boolean(viewing)} onCancel={() => setViewing(null)} footer={<Button onClick={() => setViewing(null)}>Close</Button>} width={720}>
        {viewing && <CashCustodyDetails handover={viewing} />}
      </Modal>

      <Modal title={reviewing ? actionTitle(reviewing.action) : "Review custody action"} open={Boolean(reviewing)} onCancel={() => setReviewing(null)} confirmLoading={submitting} okText={reviewing ? actionConfirmText(reviewing.action) : "Confirm"} onOk={async () => {
        if (!reviewing) return;
        setSubmitting(true);
        try {
          if (reviewing.action === "request") await onRequestHandover(reviewing.handover.id);
          if (reviewing.action === "record") await onRecordHandover(reviewing.handover.id);
          if (reviewing.action === "accept") await onAccept(reviewing.handover.id);
          setReviewing(null);
        } finally { setSubmitting(false); }
      }}>
        {reviewing && <Space direction="vertical" size={12} className="fullWidth"><Alert type={reviewing.action === "accept" ? "warning" : "info"} showIcon message={actionMessage(reviewing.action)} /><CashCustodyDetails handover={reviewing.handover} /></Space>}
      </Modal>

      <Modal
        title="Reject Cash Handover"
        open={Boolean(rejecting)}
        onCancel={() => setRejecting(null)}
        footer={null}
        destroyOnClose
      >
        {rejecting && <Space direction="vertical" size={12} className="fullWidth"><CashCustodyDetails handover={rejecting} /><Alert type="warning" showIcon message="Rejection reverses the linked Finance V2 allocation and restores the invoice amount available to collect. The custody record remains in the audit history." /></Space>}
        <Form
          name="cashCustodyReject"
          form={rejectForm}
          layout="vertical"
          onFinish={async (values) => {
            if (!rejecting) return;
            setSubmitting(true);
            try {
              await onReject(rejecting.id, values.reason.trim());
              setRejecting(null);
            } finally { setSubmitting(false); }
          }}
        >
          <Form.Item name="reason" label="Rejection Reason" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button onClick={() => setRejecting(null)}>Cancel</Button>
              <Button danger type="primary" htmlType="submit" loading={submitting}>Confirm Rejection</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

export function cashCustodyPrefillAction(isSales: boolean, paymentIsAvailable: boolean) {
  if (!paymentIsAvailable) return "none" as const;
  return isSales ? "open-create" as const : "show-guidance" as const;
}

function CashCustodyDetails({ handover }: { handover: CashHandover }) {
  const events = [
    { label: "Cash received from customer", actor: handover.collectedByName || handover.collectedByUserId, at: handover.collectedAt },
    ...(handover.handoverRequestedAt ? [{ label: "Handover requested", actor: handover.collectedByName || handover.collectedByUserId, at: handover.handoverRequestedAt }] : []),
    ...(handover.handedOverAt ? [{ label: "Physical cash transferred", actor: `${handover.handedOverByName || handover.handedOverByUserId || "Legacy giver unavailable"} → ${handover.handedOverToName || handover.handedOverToUserId || "Legacy receiver unavailable"}`, at: handover.handedOverAt }] : []),
    ...(handover.acceptedAt ? [{ label: "Custody accepted and official receipt issued", actor: handover.acceptedByName || handover.acceptedByUserId || "Checker unavailable", at: handover.acceptedAt }] : []),
    ...(handover.rejectedAt ? [{ label: `Custody rejected: ${handover.rejectionReason || "Reason unavailable"}`, actor: handover.rejectedByName || handover.rejectedByUserId || "Checker unavailable", at: handover.rejectedAt }] : [])
  ];
  return <Space direction="vertical" size={10} className="fullWidth">
    {!handover.transactionMatches && <Alert type="error" showIcon message="Transaction mismatch — acceptance is blocked" description={handover.canRejectTransaction ? "The custody details do not match, but the linked pending cash allocation can be safely reversed. Reject it and investigate the discrepancy." : handover.rejectBlockReason || "The linked cash allocation cannot be safely reversed here. Escalate this custody record without changing Finance totals."} />}
    <Descriptions bordered size="small" column={1} items={[
      { key: "transaction", label: "Transaction", children: `${handover.plateNumber} / ${handover.customerName}` },
      { key: "invoice", label: "Invoice / payment", children: handover.paymentInvoiceNumber || handover.paymentRecordId },
      { key: "amount", label: "Physical cash", children: formatMoney(handover.amount) },
      { key: "payment", label: "Finance status", children: handover.collectionStatus ?? handover.paymentStatus ?? "Unavailable" },
      { key: "holder", label: "Current holder", children: handover.status === "ReceivedBySales" || handover.status === "PendingHandover" ? handover.collectedByName : handover.handedOverToName || "Finance" },
      { key: "notes", label: "Collection notes", children: handover.notes || "-" }
    ]} />
    <Typography.Text strong>Custody timeline / 交接记录</Typography.Text>
    <Timeline items={events.map((event) => ({ children: <><Typography.Text strong>{event.label}</Typography.Text><br /><Typography.Text>{event.actor}</Typography.Text><br /><Typography.Text type="secondary">{formatDateTime(event.at)}</Typography.Text></> }))} />
  </Space>;
}

function custodyDecisionBlockReason(handover: CashHandover, actorUserId?: string) {
  if (!actorUserId) return "Sign in again before deciding custody.";
  if (handover.collectedByUserId === actorUserId) return "The collector cannot decide their own cash custody.";
  if (!handover.handedOverToUserId) return "The Finance receiver is missing. Refresh and escalate this record.";
  if (handover.handedOverToUserId === actorUserId) return "A different Finance or Boss/Admin checker must decide custody.";
  return undefined;
}

function custodyActionBlockReason(action: CustodyAction, handover: CashHandover, actorUserId?: string) {
  if (action === "request") return handover.collectedByUserId === actorUserId ? undefined : "Only the recorded collector can request handover.";
  const checkerReason = action === "accept" ? custodyDecisionBlockReason(handover, actorUserId) : handover.collectedByUserId === actorUserId ? "The collector cannot confirm Finance receipt." : undefined;
  if (checkerReason) return checkerReason;
  if (action === "accept" && !handover.transactionMatches) return handover.canRejectTransaction
    ? "Transaction mismatch: reject and investigate this record instead."
    : handover.rejectBlockReason || "The linked cash allocation cannot be safely reversed here. Escalate this custody record without changing Finance totals.";
  return undefined;
}

function visibleBlockReason(handover: CashHandover, isFinance: boolean, actorUserId?: string) {
  if (!isFinance) return undefined;
  if (handover.status === "PendingHandover") return custodyActionBlockReason("record", handover, actorUserId);
  if (handover.status === "HandedOver") return custodyActionBlockReason("accept", handover, actorUserId);
  return undefined;
}

function actionTitle(action: CustodyAction) {
  return { request: "Review Handover Request", record: "Confirm Physical Cash Receipt", accept: "Independent Custody Acceptance" }[action];
}

function actionConfirmText(action: CustodyAction) {
  return { request: "Confirm Handover Request", record: "Confirm Cash Received", accept: "Accept & Issue Receipt" }[action];
}

function actionMessage(action: CustodyAction) {
  return { request: "Confirm the physical cash is ready to hand to Finance.", record: "Count the physical cash and confirm Finance received it from the named collector.", accept: "As the independent checker, verify the amount, transaction link, and custody trail before issuing the official receipt." }[action];
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="metricCard">
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Title level={3} type={danger ? "danger" : undefined}>{value}</Typography.Title>
    </div>
  );
}

function isOverdue(handover: CashHandover) {
  return ["ReceivedBySales", "PendingHandover", "HandedOver"].includes(handover.status) && Date.now() - new Date(handover.collectedAt).getTime() > 24 * 60 * 60 * 1000;
}

function statusLabel(status: CashHandover["status"]) {
  return {
    ReceivedBySales: "Received by Sales",
    PendingHandover: "Pending Handover",
    HandedOver: "Handed Over",
    Rejected: "Rejected",
    Receipted: "Receipted"
  }[status];
}

function statusColor(status: CashHandover["status"]) {
  return {
    ReceivedBySales: "orange",
    PendingHandover: "gold",
    HandedOver: "blue",
    Rejected: "red",
    Receipted: "green"
  }[status];
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function compactSearchValue(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function composeReceiptEmail(handover: CashHandover, customers: Customer[]) {
  const customer = customers.find((item) => item.id === handover.customerId);
  if (!customer?.email) {
    message.warning("Customer email is not available for this handover.");
    return;
  }

  const subject = `YS Heng official receipt ${handover.officialReceiptNumber ?? ""}`.trim();
  const body = `Dear ${customer.name},\n\nPlease find your official receipt attached to this email.\n\nReceipt number: ${handover.officialReceiptNumber ?? ""}`;
  window.location.href = `mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
