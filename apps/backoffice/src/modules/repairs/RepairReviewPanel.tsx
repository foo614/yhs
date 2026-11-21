import { useEffect, useState } from "react";
import { Alert, Button, DatePicker, Input, Modal, Pagination, Select, Space, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { getRepairReview, recordRepairPayment, rejectRepair, type RepairReviewRow } from "../../api";
import { OperationsProTable } from "../shared/OperationsProTable";

const money = (value: number) => `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export type RepairReviewFilters = { plate: string; supplier: string; invoice: string; status?: string };
export function filterRepairReview(rows: RepairReviewRow[], filters: RepairReviewFilters) {
  const contains = (value: string | undefined, query: string) => !query.trim() || (value ?? "").toLowerCase().includes(query.trim().toLowerCase());
  return rows.filter(row => contains(row.plateNumber, filters.plate) && contains(row.supplierName, filters.supplier) && contains(row.invoiceNumber, filters.invoice)
    && (!filters.status || row.status === filters.status));
}
export function RepairReviewPanel({ canApprove, revision, onOpen, onApprove, onChanged }: {
  canApprove: boolean; revision: unknown; onOpen: (row: RepairReviewRow) => void; onApprove: (id: string) => Promise<void>; onChanged: () => void;
}) {
  const [rows, setRows] = useState<RepairReviewRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState<RepairReviewFilters>({ plate: "", supplier: "", invoice: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [payment, setPayment] = useState<RepairReviewRow | null>(null);
  const [paidAt, setPaidAt] = useState(dayjs());
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    getRepairReview().then(data => { if (active) { setRows(data); setError(""); } }).catch(() => { if (active) setError("Unable to load repair receipts / 无法读取维修单据"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision, reload]);
  const filtered = filterRepairReview(rows, filters);
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const total = filtered.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
  const totalSummary = () => <Typography.Text strong>Total amount / 总金额：{loading ? "Loading… / 读取中…" : error ? "Unavailable / 暂不可用" : money(total)}</Typography.Text>;
  const changed = () => { setReload(value => value + 1); onChanged(); };
  const confirm = (row: RepairReviewRow, reject: boolean) => Modal.confirm({
    title: reject ? "Reject receipt / 拒绝单据" : "Approve receipt / 批准单据",
    content: `${row.plateNumber} · ${row.invoiceNumber ?? "—"} · ${money(row.amount)}`,
    onOk: async () => { if (!row.repairId) return; if (reject) await rejectRepair(row.repairId); else await onApprove(row.repairId); changed(); }
  });
  const actions = (row: RepairReviewRow) => <Space wrap className="tableActionGroup">
    <Button onClick={() => onOpen(row)}>Details / 详情</Button>
    {canApprove && !error && !row.needsReview && row.repairId && row.status === "Submitted" && <><Button onClick={() => confirm(row, false)}>Approve / 批准</Button><Button danger onClick={() => confirm(row, true)}>Reject / 拒绝</Button></>}
    {canApprove && !error && !row.needsReview && row.supplierInvoiceId && row.repairId && row.status === "Approved" && <Button onClick={() => { setPayment(row); setPaidAt(dayjs()); }}>Record payment / 记录付款</Button>}
  </Space>;
  const update = (next: Partial<RepairReviewFilters>) => { setFilters(value => ({ ...value, ...next })); setPage(1); };
  return <section className="repairReviewPanel">
    {error && <Alert type="error" title={error} action={<Button onClick={() => setReload(value => value + 1)}>Retry / 重试</Button>} />}
    <Space wrap className="toolbarForm mobileRecordList">
      <Input aria-label="Car plate" placeholder="Car plate / 车牌" value={filters.plate} onChange={event => update({ plate: event.target.value })} />
      <Input aria-label="Supplier" placeholder="Supplier / 供应商" value={filters.supplier} onChange={event => update({ supplier: event.target.value })} />
      <Input aria-label="Invoice number" placeholder="Invoice / 单号" value={filters.invoice} onChange={event => update({ invoice: event.target.value })} />
      <Select aria-label="Status" placeholder="Status / 状态" allowClear style={{ minWidth: 150 }} value={filters.status} onChange={status => update({ status })} options={["Submitted", "Approved", "Paid", "Rejected"].map(value => ({ value, label: value }))} />
    </Space>
    <div className="mobileRecordList">
      {filtered.slice((current - 1) * pageSize, current * pageSize).map(row => <article className="mobileRecordCard" key={row.id}>
        <div className="mobileRecordHeader"><strong>{row.invoiceNumber || "No receipt number / 未填单号"}</strong><Tag>{row.status}</Tag></div>
        <p>{row.plateNumber} · {row.receiptDate || "—"}</p><p>{money(row.amount)}</p><div className="mobileRecordFooter">{actions(row)}</div>
      </article>)}
      <Pagination current={current} total={filtered.length} pageSize={pageSize} showTotal={totalSummary} showSizeChanger pageSizeOptions={[10, 20, 30]} onChange={(next, size) => { setPage(next); setPageSize(size); }} />
    </div>
    <OperationsProTable className="desktopDataTable nativeSearchDesktopOnly" rowKey="id" loading={loading} nativeSearch={{
      fields: [{ name: "plate", label: "Car plate / 车牌" }, { name: "supplier", label: "Supplier / 供应商" }, { name: "invoice", label: "Invoice / 单号" }, { name: "status", label: "Status / 状态", options: ["Submitted", "Approved", "Paid", "Rejected"].map(value => ({ value, label: value })) }],
      values: filters,
      onSubmit: values => update({ plate: String(values.plate ?? ""), supplier: String(values.supplier ?? ""), invoice: String(values.invoice ?? ""), status: values.status ? String(values.status) : undefined }),
      onReset: () => update({ plate: "", supplier: "", invoice: "", status: undefined })
    }} dataSource={filtered} scroll={{ x: 850 }} pagination={{ current, pageSize, showTotal: totalSummary, showSizeChanger: true, onChange: (next, size) => { setPage(next); setPageSize(size); } }} columns={[
      { title: "Invoice No / 单号", dataIndex: "invoiceNumber", render: value => value || "—" },
      { title: "Receipt date / 收据日期", dataIndex: "receiptDate", render: value => value || "—" },
      { title: "Car plate / 车牌", dataIndex: "plateNumber" },
      { title: "Amount / 金额", dataIndex: "amount", render: value => money(value) },
      { title: "Status / 状态", dataIndex: "status", render: value => <Tag>{value}</Tag> },
      { title: "Action / 操作", fixed: "right", render: (_, row) => actions(row) }
    ]} />
    {filtered.length === 0 && <div className="desktopDataTable repairReviewEmptyFooter">{totalSummary()}</div>}
    <Modal title="Record completed payment / 记录已付款" open={Boolean(payment)} onCancel={() => setPayment(null)} confirmLoading={saving} onOk={async () => {
      if (!payment || !paidAt) return;
      setSaving(true);
      try { await recordRepairPayment(payment.id, paidAt.format("YYYY-MM-DD"), payment.amount); setPayment(null); changed(); }
      catch (failure) { message.error(failure instanceof Error ? failure.message : "Unable to record payment"); }
      finally { setSaving(false); }
    }}>
      <p>{payment?.plateNumber} · {payment?.invoiceNumber} · {money(payment?.amount ?? 0)}</p>
      <DatePicker aria-label="Payment date" value={paidAt} onChange={value => { if (value) setPaidAt(value); }} allowClear={false} />
    </Modal>
  </section>;
}
