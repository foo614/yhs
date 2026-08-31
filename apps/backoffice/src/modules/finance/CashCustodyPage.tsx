import { useMemo, useState } from "react";
import { ProCard } from "@ant-design/pro-components";
import { Alert, Button, Descriptions, Empty, Form, Input, InputNumber, Modal, Pagination, Select, Space, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { OperationsProTable, operationsKeywordFromFields } from "../shared/OperationsProTable";
import { FINANCE_LIST_PAGE_SIZE, filterFinanceRows, financeEmptyText, financePageFor, pageFinanceRows } from "./financeList";
import { formatMoney, formatMoneyInput, parseMoneyInput } from "../../money";
import {
  officialReceiptContentUrl,
  type CashHandover,
  type CashHandoverPaymentLookup,
  type CurrentUser,
  type Customer
} from "../../api";

export type CashCustodyStatusFilter = CashHandover["status"] | "All" | "Overdue" | "AmountMismatch";

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
      payment?.plateNumber,
      payment?.customerName,
      payment?.invoiceNumber,
      handover.officialReceiptNumber,
      handover.collectedByUserId,
      statusLabel(handover.status)
    ].some((value) => {
      const normalizedValue = value?.toLowerCase() ?? "";
      return normalizedValue.includes(normalizedKeyword)
        || (Boolean(compactKeyword) && compactSearchValue(normalizedValue).includes(compactKeyword));
    });
    const matchesStatus = status === "All"
      || (status === "Overdue" ? isOverdue(handover) : status === "AmountMismatch" ? isAmountMismatch(handover, paymentLookup) : handover.status === status);

    return matchesKeyword && matchesStatus;
  });
}

export function CashCustodyPage({
  currentUser,
  customers,
  handovers,
  paymentLookup,
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
  onCreate: (paymentRecordId: string, amount: number, notes?: string) => Promise<void>;
  onRequestHandover: (id: string) => Promise<void>;
  onRecordHandover: (id: string) => Promise<void>;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [rejecting, setRejecting] = useState<CashHandover | null>(null);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<CashHandover["status"]>();
  const [page, setPage] = useState(1);
  const [createForm] = Form.useForm<{ paymentRecordId: string; amount: number; notes?: string }>();
  const [rejectForm] = Form.useForm<{ reason: string }>();
  const isFinance = currentUser?.roles.some((role) => role === "BossAdmin" || role === "Finance") ?? false;
  const isSales = currentUser?.roles.some((role) => role === "BossAdmin" || role === "Sales") ?? false;
  const currentUserId = currentUser?.id;
  const usedPayments = useMemo(() => new Set(handovers.map((handover) => handover.paymentRecordId)), [handovers]);
  const availablePayments = paymentLookup.filter((payment) => !usedPayments.has(payment.paymentRecordId));
  const overdueCount = handovers.filter(isOverdue).length;
  const mismatchCount = handovers.filter((handover) => isAmountMismatch(handover, paymentLookup)).length;
  const filteredHandovers = useMemo(() => filterFinanceRows(
    handovers,
    keyword,
    status,
    (handover) => {
      const payment = paymentLookup.find((item) => item.paymentRecordId === handover.paymentRecordId);
      return [
        payment?.plateNumber,
        payment?.customerName,
        payment?.invoiceNumber,
        handover.officialReceiptNumber,
        handover.collectedByUserId,
        handover.paymentRecordId,
        statusLabel(handover.status)
      ];
    },
    (handover) => handover.status
  ), [handovers, keyword, paymentLookup, status]);
  const custodyPage = financePageFor(filteredHandovers.length, page);
  const visibleHandovers = pageFinanceRows(filteredHandovers, custodyPage);
  const custodyFiltersActive = Boolean(keyword.trim() || status);
  const custodyEmptyText = financeEmptyText(handovers.length, filteredHandovers.length, "cash handovers");

  const renderHandoverActions = (handover: CashHandover) => (
    <Space className="tableActionGroup" wrap size={6}>
      {isSales && currentUserId === handover.collectedByUserId && handover.status === "ReceivedBySales" && (
        <Button size="small" type="primary" onClick={() => void onRequestHandover(handover.id)}>Request Handover</Button>
      )}
      {isFinance && handover.status === "PendingHandover" && (
        <Button size="small" type="primary" onClick={() => void onRecordHandover(handover.id)}>Confirm Cash Received</Button>
      )}
      {isFinance && handover.status === "HandedOver" && (
        <>
          <Button size="small" type="primary" onClick={() => void onAccept(handover.id)}>Accept & Issue Receipt</Button>
          <Button size="small" danger onClick={() => { rejectForm.resetFields(); setRejecting(handover); }}>Reject</Button>
        </>
      )}
    </Space>
  );

  const columns: ColumnsType<CashHandover> = [
    {
      title: "Custody / 保管",
      render: (_, handover) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{paymentLabel(handover, paymentLookup)}</Typography.Text>
          <Typography.Text type="secondary">Collector: {handover.collectedByUserId}</Typography.Text>
        </Space>
      )
    },
    { title: "Amount / 金额", render: (_, handover) => formatMoney(handover.amount) },
    {
      title: "Status / 状态",
      render: (_, handover) => (
        <Space wrap size={4}>
          <Tag color={statusColor(handover.status)}>{statusLabel(handover.status)}</Tag>
          {isOverdue(handover) && <Tag color="red">Overdue</Tag>}
          {isAmountMismatch(handover, paymentLookup) && <Tag color="red">Amount mismatch</Tag>}
        </Space>
      )
    },
    { title: "Received / 收款", render: (_, handover) => formatDateTime(handover.collectedAt) },
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
        extra={isSales ? <Button type="primary" onClick={() => { createForm.resetFields(); setCreateOpen(true); }}>Record Cash Received</Button> : null}
      >
        <Space direction="vertical" size={12} className="fullWidth">
          <Alert
            type="warning"
            showIcon
            message="Cash custody is separate from payment reconciliation. A finance user must confirm the physical handover before a receipt is issued."
          />
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
              options={(["ReceivedBySales", "PendingHandover", "HandedOver", "Rejected", "Receipted"] as CashHandover["status"][]).map((value) => ({ value, label: statusLabel(value) }))}
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
                    <Typography.Title level={5}>{paymentLabel(handover, paymentLookup)}</Typography.Title>
                    <Typography.Text type="secondary">Collector: {handover.collectedByUserId}</Typography.Text>
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
                    <Space wrap size={6}>
                      <Tag color="green">{handover.officialReceiptNumber}</Tag>
                      <Button size="small" href={officialReceiptContentUrl(handover.id)} target="_blank">Download</Button>
                      <Button size="small" onClick={() => composeReceiptEmail(handover, customers)}>Compose Email</Button>
                    </Space>
                  ) : <Typography.Text type="secondary">Not issued</Typography.Text>}
                  {isAmountMismatch(handover, paymentLookup) && <Tag color="red">Amount mismatch</Tag>}
                </div>
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
                setStatus(values.status as CashHandover["status"] | undefined);
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
          form={createForm}
          layout="vertical"
          onFinish={async (values) => {
            await onCreate(values.paymentRecordId, Number(values.amount), values.notes?.trim() || undefined);
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
                label: `${payment.plateNumber} / ${payment.customerName} / ${payment.invoiceNumber || "No invoice"} / ${formatMoney(payment.nettPrice)}`
              }))}
              onChange={(paymentRecordId) => {
                const payment = paymentLookup.find((item) => item.paymentRecordId === paymentRecordId);
                if (payment) createForm.setFieldValue("amount", payment.nettPrice);
              }}
            />
          </Form.Item>
          <Form.Item name="amount" label="Cash Amount" rules={[{ required: true }]}>
            <InputNumber className="fullWidth" min={0.01} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} />
          </Form.Item>
          <Form.Item name="notes" label="Collection Notes"><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
          <Form.Item>
            <Space>
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">Save Cash Received</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Reject Cash Handover"
        open={Boolean(rejecting)}
        onCancel={() => setRejecting(null)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={rejectForm}
          layout="vertical"
          onFinish={async (values) => {
            if (!rejecting) return;
            await onReject(rejecting.id, values.reason.trim());
            setRejecting(null);
          }}
        >
          <Form.Item name="reason" label="Rejection Reason" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button onClick={() => setRejecting(null)}>Cancel</Button>
              <Button danger type="primary" htmlType="submit">Reject Handover</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="metricCard">
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Title level={3} type={danger ? "danger" : undefined}>{value}</Typography.Title>
    </div>
  );
}

function paymentLabel(handover: CashHandover, paymentLookup: CashHandoverPaymentLookup[]) {
  const payment = paymentLookup.find((item) => item.paymentRecordId === handover.paymentRecordId);
  return payment ? `${payment.plateNumber} / ${payment.customerName}` : handover.paymentRecordId;
}

function isOverdue(handover: CashHandover) {
  return ["ReceivedBySales", "PendingHandover", "HandedOver"].includes(handover.status) && Date.now() - new Date(handover.collectedAt).getTime() > 24 * 60 * 60 * 1000;
}

function isAmountMismatch(handover: CashHandover, paymentLookup: CashHandoverPaymentLookup[]) {
  const payment = paymentLookup.find((item) => item.paymentRecordId === handover.paymentRecordId);
  return payment !== undefined && payment.nettPrice !== handover.amount;
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
