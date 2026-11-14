import { DocumentPreviewButton } from "../shared/DocumentPreviewButton";
import { settlementBanks as banks } from "../../settlementBanks";
import { OperationsProTable } from "../shared/OperationsProTable";
import { useState } from "react";
import { Alert, AutoComplete, Button, DatePicker, Form, Input, InputNumber, Modal, Pagination, Select, Space, Tabs, Tag, Upload } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { getProtectedFileContent, vehicleDocumentContentUrl, uploadBankSettlementEvidence, completeBankSettlement, createBankSettlement, updateBankSettlement, getVehicleDocumentsStrict, humanizeApiError, type BankSettlementInput, type SettlementReminder, type VehicleDocument, type VehicleLookup } from "../../api";
import { formatMoney } from "../../money";



export function BankSettlementPanel({ records, vehicles, canManage, refresh }: {
  records: SettlementReminder[]; vehicles: VehicleLookup[]; canManage: boolean;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState("to-pay");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SettlementReminder>();
  const [source, setSource] = useState<SettlementReminder>();
  const [complete, setComplete] = useState<SettlementReminder>();
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [plate, setPlate] = useState("");
  const [form] = Form.useForm();
  const [paymentForm] = Form.useForm();
  const bankRows = records.filter(x => x.direction === "PayBank" && !x.supersededById);
  const historical = records.filter(x => x.direction !== "PayBank");
  const rows = (tab === "history" ? historical : bankRows.filter(x => x.isPaid === (tab === "done")))
    .filter(x => (vehicles.find(v => v.id === x.vehicleId)?.plateNumber ?? "").toLowerCase().includes(plate.toLowerCase()))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  function startCreate(record?: SettlementReminder) {
    setEditing(undefined); setSource(record); setError(undefined); form.resetFields();
    if (record) form.setFieldsValue({ vehicleId: record.vehicleId, bankDebtAmount: record.bankDebtAmount, deadline: dayjs(record.deadline) });
    setCreateOpen(true);
  }
  function startEdit(record: SettlementReminder) {
    setEditing(record); setSource(undefined); setError(undefined); form.resetFields();
    form.setFieldsValue({ ...record, deadline: dayjs(record.deadline) }); setCreateOpen(true);
  }
  async function startComplete(record: SettlementReminder) {
    setError(undefined); setBusy(true);
    try { setDocuments(await getVehicleDocumentsStrict(record.vehicleId)); paymentForm.resetFields(); setComplete(record); }
    catch (e) { setError(humanizeApiError(e, "Could not load payment documents.")); }
    finally { setBusy(false); }
  }
  const renderActions = (r: SettlementReminder) => r.isPaid ? <Space direction="vertical"><span>{r.paidOn ? `Paid ${dayjs(r.paidOn).format("DD MMM YYYY")}` : "Historical completion"}</span>{r.paymentDocumentId && <DocumentPreviewButton fileName="Settlement payment evidence" downloadUrl={vehicleDocumentContentUrl(r.vehicleId, r.paymentDocumentId)} loadContent={() => getProtectedFileContent(vehicleDocumentContentUrl(r.vehicleId, r.paymentDocumentId!))} />}</Space> : r.supersededById ? "Replaced by bank record" : !canManage ? null : r.direction === "PayBank" ? <Space wrap><Button disabled={busy} onClick={() => startEdit(r)}>Edit details</Button><Button disabled={busy} onClick={() => void startComplete(r)}>Record payment</Button></Space> : <Button disabled={!(r.bankDebtAmount && r.bankDebtAmount > 0)} onClick={() => startCreate(r)}>Review bank debt</Button>;
  return <Space direction="vertical" size="middle" className="fullWidth">
    {error && <Alert type="error" showIcon message={error} />}
    <Space wrap>
      <Input className="pageFilterMobileOnly" aria-label="Filter settlement by plate" placeholder="Car plate / 车牌" value={plate} onChange={e => { setPlate(e.target.value); setPage(1); }} allowClear />
      {canManage && <Button type="primary" onClick={() => startCreate()}>New bank settlement / 新增银行结算</Button>}
    </Space>
    <Tabs activeKey={tab} onChange={value => { setTab(value); setPage(1); }} items={[
      { key: "to-pay", label: `To pay / 待付 (${bankRows.filter(x => !x.isPaid).length})` },
      { key: "done", label: `Done / 已完成 (${bankRows.filter(x => x.isPaid).length})` },
      { key: "history", label: "Previous records / 旧记录" }
    ]} />
    {tab === "history" && <Alert type="info" showIcon message="Original seller records are preserved. Review outstanding bank debt before replacing an unpaid record." />}
    <div className="mobileRecordList">
      {rows.slice((Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize))) - 1) * pageSize, Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize))) * pageSize).map(r => <article className="mobileRecordCard" key={r.id}>
        <div className="mobileRecordHeader"><strong>{vehicles.find(v => v.id === r.vehicleId)?.plateNumber ?? "—"}</strong><Tag>{r.supersededById ? "Replaced" : r.isPaid ? "Done" : r.direction === "PayBank" ? "To pay" : "Needs review"}</Tag></div>
        <div className="mobileRecordMeta">
          <span><small>{r.direction === "PayBank" ? "Outstanding Bank Debt" : "Original amount"}</small><strong>{formatMoney(r.amount)}</strong></span>
          <span><small>Deadline</small><strong>{dayjs(r.deadline).format("DD MMM YYYY")}</strong></span>
          <span><small>Payee</small><strong>{r.direction === "PayBank" ? `Pay to bank · ${r.bankName}` : r.direction === "CollectFromSeller" ? "Collect from seller" : r.direction === "InternalOffset" ? "Internal offset" : "Pay seller"}</strong></span>
        </div>
        <div className="mobileRecordFooter">{renderActions(r)}</div>
      </article>)}
      {rows.length === 0 && <span>No settlement records / 暂无记录</span>}
    <Pagination className="mobileRecordPagination" current={Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)))} total={rows.length} pageSize={pageSize} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} onChange={(next, size) => { setPage(next); setPageSize(size); }} />
    </div>
    <OperationsProTable className="desktopDataTable nativeSearchDesktopOnly" nativeSearch={{ fields: [{ name: "plate", label: "Car plate" }], values: { plate }, onSubmit: values => setPlate(String(values.plate ?? "")), onReset: () => setPlate("") }} rowKey="id" dataSource={rows} scroll={{ x: 850 }} pagination={{ defaultPageSize: 10, pageSize, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], onShowSizeChange: (_, size) => setPageSize(size) }} columns={[
      { title: "Car plate / 车牌", render: (_, r) => vehicles.find(v => v.id === r.vehicleId)?.plateNumber ?? "—" },
      { title: tab === "history" ? "Original amount / 原金额" : "Outstanding Bank Debt / 银行欠款", render: (_, r) => formatMoney(tab === "history" ? r.amount : r.bankDebtAmount ?? 0) },
      { title: "Direction / 付款对象", render: (_, r) => r.direction === "PayBank" ? "Pay to bank" : r.direction === "CollectFromSeller" ? "Collect from seller" : r.direction === "InternalOffset" ? "Internal offset" : "Pay seller" },
      { title: "Bank / 银行", dataIndex: "bankName" },
      { title: "Deadline / 到期日", render: (_, r) => dayjs(r.deadline).format("DD MMM YYYY") },
      { title: "Status / 状态", render: (_, r) => <Tag color={r.isPaid ? "green" : "orange"}>{r.supersededById ? "Replaced" : r.isPaid ? "Done" : r.direction === "PayBank" ? "To pay" : "Needs review"}</Tag> },
      { title: "Action / 操作", fixed: "right", render: (_, r) => renderActions(r) }
    ]} />
    <Modal title={editing ? "Update bank settlement" : source ? "Review and replace seller settlement" : "New bank settlement"} okText={editing ? "Confirm update" : "Confirm bank settlement"} open={createOpen} confirmLoading={busy} onOk={() => form.submit()} onCancel={() => { if (!busy) setCreateOpen(false); }} maskClosable={false}>
      {error && <Alert type="error" message={error} />}
      {source && <Alert type="info" message={`Original seller amount ${formatMoney(source.amount)} stays in history. Confirming replaces its pending task with a bank payment of ${formatMoney(source.bankDebtAmount ?? 0)}.`} />}
      <Form form={form} layout="vertical" disabled={busy} onFinish={async (values: Omit<BankSettlementInput, "deadline"> & { deadline: Dayjs }) => {
        setBusy(true); setError(undefined);
        try {
          const input = { ...values, deadline: values.deadline.format("YYYY-MM-DD") };
          if (editing) await updateBankSettlement(editing.id, { ...input, expectedBankDebtAmount: editing.bankDebtAmount ?? 0, expectedDeadline: editing.deadline, expectedBankName: editing.bankName ?? "", expectedBankAccountNumber: editing.bankAccountNumber ?? "" });
          else await createBankSettlement({ ...input, replacesSettlementId: source?.id });
          setCreateOpen(false); await refresh();
        }
        catch (e) { setError(humanizeApiError(e, "Could not save bank settlement.")); }
        finally { setBusy(false); }
      }}>
        <Form.Item name="vehicleId" label="Car plate" rules={[{ required: true }]}><Select disabled={Boolean(source || editing)} showSearch optionFilterProp="label" options={vehicles.map(v => ({ value: v.id, label: v.plateNumber }))} /></Form.Item>
        <Form.Item name="bankDebtAmount" label="Outstanding bank debt" rules={[{ required: true }]}><InputNumber disabled={Boolean(source)} min={0.01} precision={2} className="fullWidth" /></Form.Item>
        <Form.Item name="deadline" label="Settlement deadline" rules={[{ required: true }]}><DatePicker disabled={Boolean(source)} format="DD MMM YYYY" className="fullWidth" /></Form.Item>
        <Form.Item name="bankName" label="Bank name" rules={[{ required: true, whitespace: true, max: 200 }]}><AutoComplete options={banks.map(value => ({ value }))} filterOption={(input, option) => String(option?.value).toLowerCase().includes(input.toLowerCase())} /></Form.Item>
        <Form.Item name="bankAccountNumber" label="Bank account number" rules={[{ required: true, whitespace: true, max: 80 }]}><Input /></Form.Item>
      </Form>
    </Modal>
    <Modal title="Confirm full bank settlement / 确认还清" open={Boolean(complete)} confirmLoading={busy} onOk={() => paymentForm.submit()} onCancel={() => { if (!busy) setComplete(undefined); }} maskClosable={false}>
      {error && <Alert type="error" message={error} />}
      {complete && <>
        <p>{complete.bankName} · {complete.bankAccountNumber} · {formatMoney(complete.bankDebtAmount ?? 0)}</p>
        <Upload accept=".pdf,.jpg,.jpeg,.png" showUploadList={false} disabled={busy} beforeUpload={file => {
          setBusy(true); setError(undefined);
          void uploadBankSettlementEvidence(complete.vehicleId, complete.id, file).then(async () => setDocuments(await getVehicleDocumentsStrict(complete.vehicleId))).catch(e => setError(humanizeApiError(e, "Upload failed."))).finally(() => setBusy(false));
          return false;
        }}><Button disabled={busy}>Upload payment document</Button></Upload>
        <Form form={paymentForm} layout="vertical" disabled={busy} onFinish={async (values: { paymentDocumentId: string; paidOn: Dayjs }) => {
          setBusy(true); setError(undefined);
          try { await completeBankSettlement(complete.id, { paymentDocumentId: values.paymentDocumentId, paidOn: values.paidOn.format("YYYY-MM-DD"), expectedBankDebtAmount: complete.bankDebtAmount ?? 0, expectedDeadline: complete.deadline, expectedBankName: complete.bankName ?? "", expectedBankAccountNumber: complete.bankAccountNumber ?? "" }); setComplete(undefined); await refresh(); }
          catch (e) { setError(humanizeApiError(e, "Could not confirm payment.")); }
          finally { setBusy(false); }
        }}>
          <Form.Item name="paymentDocumentId" label="Payment document" rules={[{ required: true }]}><Select options={documents.filter(d => d.category === "BankSettlementPayment" && d.bankSettlementId === complete.id).map(d => ({ value: d.id, label: d.fileName }))} /></Form.Item>
          <Form.Item name="paidOn" label="Payment date" rules={[{ required: true }]}><DatePicker format="DD MMM YYYY" className="fullWidth" /></Form.Item>
        </Form>
      </>}
    </Modal>
  </Space>;
}
