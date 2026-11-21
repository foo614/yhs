import { useRef, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { Alert, Button, Checkbox, DatePicker, Drawer, Form, Input, InputNumber, Modal, Select, Space, Typography, Upload, message } from "antd";
import { confirmInsuranceImport, previewInsuranceImport, previewInsuranceReceipt, recordInsuranceInsurerPayment, saveInsuranceCase, type InsuranceCase, type InsuranceCaseView, type InsuranceImportInput, type InsuranceImportPreview, type InsuranceReceipt, type InsuranceReceiptInput } from "../../api";
import { formatDisplayDate } from "../../dateDisplay";

const failure = (error: unknown) => error instanceof Error ? error.message : "Unable to complete this request.";
type CaseForm = Omit<InsuranceCase, "expiryDate" | "coverStartDate" | "roadTaxExpiryDate"> & { expiryDate: Dayjs; coverStartDate?: Dayjs; roadTaxExpiryDate?: Dayjs };
type MoneyForm = Omit<InsuranceReceiptInput, "idempotencyKey" | "receivedDate"> & { receivedDate: Dayjs; paidDate: Dayjs; reference: string };
const headers = ["NAME", "IC NO.", "VEHICLE NO.", "EXP DATE", "INSURANCE", "COVERAGE", "NCD", "RENEWAL/NEW", "REMARK", "Customer Phone Number"];

export function InsuranceCaseForm({ record, onClose, onSaved }: { record?: InsuranceCase; onClose: () => void; onSaved: (saved: InsuranceCaseView) => Promise<void> }) {
  const [form] = Form.useForm<CaseForm>();
  const [busy, setBusy] = useState(false);
  const roadTaxMethod = Form.useWatch("roadTaxMethod", form);
  const caseType = Form.useWatch("caseType", form);
  const initialValues = record ? { ...record, expiryDate: dayjs(record.expiryDate), coverStartDate: record.coverStartDate ? dayjs(record.coverStartDate) : undefined, roadTaxExpiryDate: record.roadTaxExpiryDate ? dayjs(record.roadTaxExpiryDate) : undefined } : { id: crypto.randomUUID(), version: 0, caseType: "New", company: "Automotive", insurer: "", coverage: "", renewalDeclined: false, roadTaxMethod: "None", roadTaxMonths: 12, roadTaxCompleted: false, insuranceAmount: 0, roadTaxAmount: 0, runnerFee: 0, discount: 0, otherCharges: [], specialJpjSale: false };
  function save(values: CaseForm) {
    const payload: InsuranceCase = { ...values, runnerFee: values.roadTaxMethod === "JPJ" ? values.runnerFee : 0, expiryDate: values.expiryDate.format("YYYY-MM-DD"), coverStartDate: values.coverStartDate?.format("YYYY-MM-DD") ?? null, roadTaxExpiryDate: values.roadTaxExpiryDate?.format("YYYY-MM-DD") ?? null };
    Modal.confirm({ title: record ? "Save case changes? / 保存更改？" : "Create standalone case? / 新增独立个案？", content: `${payload.plateNumber} · ${payload.customerName}. Confirm dates, charges and renewal status.`, okText: "Confirm save / 确认保存", onOk: async () => { setBusy(true); try { await onSaved(await saveInsuranceCase(payload, !!record)); message.success("Insurance case saved."); } catch (e) { message.error(failure(e)); throw e; } finally { setBusy(false); } } });
  }
  return <Drawer title={record ? "Edit insurance case / 编辑保险个案" : "New insurance case / 新增保险个案"} open onClose={() => !busy && onClose()} width={850} className="insuranceDrawer" footer={<Space wrap><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="primary" loading={busy} onClick={() => form.submit()}>Review & save / 检查保存</Button></Space>}>
    <Alert type="info" title="Standalone record / 独立记录" description="Enter this case's plate and customer details directly. Quote values are internal; quotation text, PDF and automatic sending are on hold." />
    <Form form={form} layout="vertical" initialValues={initialValues} onFinish={save}>
      <Form.Item name="id" hidden><Input /></Form.Item><Form.Item name="version" hidden><InputNumber /></Form.Item>
      <div className="formGrid">
        <Form.Item name="plateNumber" label="Plate / 车牌" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
        <Form.Item name="customerName" label="Customer name / 客户姓名" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
        <Form.Item name="customerPhone" label="Customer phone / 客户电话" extra="Optional for internal renewal reminders"><Input type="tel" /></Form.Item>
        <Form.Item name="identityNumber" label="IC / company number / 身份证或公司号码"><Input /></Form.Item>
        <Form.Item name="caseType" label="Case type / 个案类型" rules={[{ required: true }]}><Select options={[{ value: "New", label: "New / 新保" }, { value: "Renewal", label: "Renewal / 续保" }, { value: "BankArranged", label: "Bank-arranged / 银行安排" }]} /></Form.Item>
        <Form.Item name="company" label="Customer invoice book / 客户发票公司"><Select options={[{ value: "Automotive", label: "YS Heng Automotive (default)" }, { value: "Auto", label: "YS Heng Auto · cash customer" }]} /></Form.Item>
        {caseType === "BankArranged" && <><Form.Item name="bankCreditorName" label="Actual bank creditor / 实际银行债权人"><Input /></Form.Item><Form.Item name="bankInvoiceNumber" label="Bank invoice number / 银行发票号码"><Input /></Form.Item></>}
        <Form.Item name="insurer" label="Insurer / 保险公司"><Input /></Form.Item><Form.Item name="coverage" label="Coverage / 保障"><Input /></Form.Item>
        <Form.Item name="ncd" label="NCD (%)"><InputNumber min={0} max={100} className="fullWidth" /></Form.Item>
        <Form.Item name="policyNumber" label="Policy number / 保单号码"><Input /></Form.Item>
        <Form.Item name="coverStartDate" label="Cover start / 生效日"><DatePicker className="fullWidth" format="DD MMM YYYY" /></Form.Item>
        <Form.Item name="expiryDate" label="Insurance expiry / 保险到期日" rules={[{ required: true }]}><DatePicker className="fullWidth" format="DD MMM YYYY" /></Form.Item>
        <Form.Item name="roadTaxMethod" label="Road tax method / 路税方式"><Select onChange={value => form.setFieldValue("runnerFee", value === "JPJ" ? 20 : 0)} options={[{ value: "None", label: "Not required / 无需" }, { value: "JPJ", label: "JPJ runner / 跑腿" }, { value: "EAuto", label: "eAuto" }]} /></Form.Item>
        <Form.Item name="roadTaxMonths" label="Road tax period / 路税期限"><Select options={[{ value: 6, label: "6 months / 半年" }, { value: 12, label: "12 months / 一年" }]} /></Form.Item>
        <Form.Item name="roadTaxExpiryDate" label="Road tax expiry / 路税到期日"><DatePicker className="fullWidth" format="DD MMM YYYY" /></Form.Item>
        <Form.Item name="insuranceAmount" label="Policy / quoted insurance (RM)" rules={[{ required: true }]}><InputNumber min={0} precision={2} className="fullWidth" /></Form.Item>
        <Form.Item name="roadTaxAmount" label="Road tax (RM) / 路税"><InputNumber min={0} precision={2} className="fullWidth" /></Form.Item>
        <Form.Item name="runnerFee" label="Runner fee (RM) / 跑腿费"><InputNumber disabled={roadTaxMethod !== "JPJ"} min={0} precision={2} className="fullWidth" /></Form.Item>
        <Form.Item name="discount" label="Customer discount (RM) / 客户折扣"><InputNumber min={0} precision={2} className="fullWidth" /></Form.Item>
        <Form.Item name="invoiceNumber" label="Customer invoice number / 客户发票号码"><Input /></Form.Item>
        <Form.Item name="insurerInvoiceNumber" label="Insurer invoice number / 保险发票号码"><Input /></Form.Item>
        <Form.Item name="intercompanyInvoiceNumber" label="Auto intercompany invoice number"><Input /></Form.Item>
      </div>
      <Form.Item name="roadTaxCompleted" valuePropName="checked"><Checkbox>Road tax completed / 路税已完成 (JPJ requires receipt)</Checkbox></Form.Item>
      <Form.Item name="renewalDeclined" valuePropName="checked"><Checkbox>Customer declined renewal / 客户拒绝续保 · stop future renewal reminders</Checkbox></Form.Item>
      <Form.Item name="specialJpjSale" valuePropName="checked"><Checkbox>Special JPJ charges paid on customer's behalf / 特别 JPJ 代付</Checkbox></Form.Item>
      <Form.List name="otherCharges">{(fields, { add, remove }) => <Space direction="vertical" className="fullWidth"><Typography.Text strong>Other charges / 其他费用</Typography.Text>{fields.map(field => <div className="insuranceCharge" key={field.key}><Form.Item name={[field.name, "itemCode"]} label="Item code" rules={[{ required: true }]}><Select options={["LICENSE", "INTERCHANGE NUMBER", "STMS/E-SERAHAN", "SAMAN", "TENDER"].map(value => ({ value, label: value }))} /></Form.Item><Form.Item name={[field.name, "description"]} label="Description" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name={[field.name, "amount"]} label="Amount (RM)" rules={[{ required: true }]}><InputNumber min={0} precision={2} className="fullWidth" /></Form.Item><Button onClick={() => remove(field.name)}>Remove</Button></div>)}<Button onClick={() => add({ itemCode: "", description: "", amount: 0 })}>Add charge / 新增费用</Button></Space>}</Form.List>
      <Form.Item name="remark" label="Remark / 备注"><Input.TextArea rows={2} /></Form.Item>
    </Form>
  </Drawer>;
}

export function InsuranceMoneyForm({ kind, selected, onClose, onSaved }: { kind: "receipt" | "insurer"; selected: InsuranceCaseView; onClose: () => void; onSaved: (receipt?: InsuranceReceipt) => Promise<void> }) {
  const [form] = Form.useForm<MoneyForm>();
  const [busy, setBusy] = useState(false);
  const idempotency = useRef(crypto.randomUUID());
  const receipt = kind === "receipt";
  async function save(values: MoneyForm) {
    setBusy(true);
    try {
      if (receipt) await onSaved(await previewInsuranceReceipt(selected.record.id, { amount: values.amount, invoiceNumber: values.invoiceNumber, paymentType: values.paymentType, depositAccount: values.depositAccount, evidenceAttachmentId: values.evidenceAttachmentId, receivedDate: values.receivedDate.format("YYYY-MM-DD"), idempotencyKey: idempotency.current }));
      else { await recordInsuranceInsurerPayment(selected.record.id, { amount: values.amount, reference: values.reference, paidDate: values.paidDate.format("YYYY-MM-DD"), idempotencyKey: idempotency.current }); await onSaved(); message.success("Actual insurer payment recorded."); }
    } catch (e) { message.error(failure(e)); }
    finally { setBusy(false); }
  }
  return <Modal title={receipt ? "Customer receipt / 客户收款" : "Final actual insurer payment / 最终保险付款"} open onCancel={() => !busy && onClose()} onOk={() => form.submit()} okText={receipt ? "Preview receipt / 预览收款" : "Confirm final insurer settlement"} confirmLoading={busy}>
    <Alert type="info" title={receipt ? "Receipt evidence needs verification" : "Independent insurer payment"} description={receipt ? "A pending receipt does not reduce outstanding. Review the case, invoice and amount, then explicitly confirm actual funds." : "Enter the final full amount actually paid to the insurer once. This amount calculates commission and does not settle customer outstanding."} />
    <Form form={form} layout="vertical" onFinish={values => void save(values)} initialValues={{ amount: receipt ? selected.outstanding : undefined, receivedDate: dayjs(), paidDate: dayjs(), paymentType: "Transfer", depositAccount: "PBB", invoiceNumber: selected.record.invoiceNumber ?? "" }}>
      {receipt && <Form.Item name="invoiceNumber" label="Customer invoice number" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>}
      <Form.Item name="amount" label={receipt ? "Amount received (RM)" : "Amount paid (RM)"} rules={[{ required: true }]}><InputNumber min={0.01} precision={2} className="fullWidth" /></Form.Item>
      <Form.Item name={receipt ? "receivedDate" : "paidDate"} label={receipt ? "Received date" : "Paid date"} rules={[{ required: true }]}><DatePicker className="fullWidth" /></Form.Item>
      {receipt ? <><Form.Item name="paymentType" label="Original payment type" rules={[{ required: true }]}><Select options={["Cash", "TNG", "Transfer", "Card"].map(value => ({ value, label: value }))} /></Form.Item><Form.Item name="depositAccount" label="Actual funds destination / 实际入账" rules={[{ required: true }]}><Select options={[{ value: "PBB", label: "Company PBB account" }, { value: "Cash", label: "Cash" }]} /></Form.Item><Form.Item name="evidenceAttachmentId" label="Linked payment evidence"><Select allowClear options={selected.attachments.filter(file => file.kind === "PaymentEvidence").map(file => ({ value: file.id, label: file.fileName }))} /></Form.Item></> : <Form.Item name="reference" label="Payment reference" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>}
    </Form>
  </Modal>;
}

export function InsuranceImport({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [input, setInput] = useState<InsuranceImportInput>();
  const [preview, setPreview] = useState<InsuranceImportPreview>();
  const [busy, setBusy] = useState(false);
  const idempotency = useRef(crypto.randomUUID());
  const change = (value: string) => { setText(value); setPreview(undefined); setInput(undefined); };
  async function showPreview() {
    const lines = text.replace(/^\uFEFF/, "").replace(/[\r\n]+$/, "").split(/\r?\n/).filter(line => line.trim());
    const data = { headers: (lines.shift() ?? "").split("\t"), rows: lines.map(line => line.split("\t")) };
    setBusy(true);
    try { setPreview(await previewInsuranceImport(data)); setInput(data); idempotency.current = crypto.randomUUID(); }
    catch (e) { message.error(failure(e)); }
    finally { setBusy(false); }
  }
  return <Modal title="Import existing listing / 导入旧名单" open onCancel={() => !busy && onClose()} width={850} footer={<Space wrap><Button onClick={onClose} disabled={busy}>Cancel</Button><Button loading={busy} onClick={() => void showPreview()}>Preview import / 预览导入</Button><Button type="primary" loading={busy} disabled={!preview?.records.length || !!preview.errors.length || !input} onClick={() => void (async () => { if (!input) return; setBusy(true); try { await confirmInsuranceImport({ ...input, idempotencyKey: idempotency.current }); await onSaved(); message.success("Listing imported."); } catch (e) { message.error(failure(e)); } finally { setBusy(false); } })()}>Confirm import / 确认导入</Button></Space>}>
    <Space direction="vertical" className="fullWidth"><Typography.Paragraph>Copy the listing cells from your spreadsheet, including its header row. Append Customer Phone Number as the last column. Use day/month/year expiry dates. Missing phone numbers still allow internal reminders.</Typography.Paragraph><Typography.Text code>{headers.join(" | ")}</Typography.Text><Upload accept=".tsv,.txt" showUploadList={false} beforeUpload={file => { void file.text().then(change); return Upload.LIST_IGNORE; }}><Button>Read tab-separated file</Button></Upload><Input.TextArea rows={8} value={text} aria-label="Tab-separated listing including header row" onChange={event => change(event.target.value)} />{preview && <>{preview.errors.map((item, index) => <Alert key={index} type="error" title={item} />)}<Typography.Text strong>{preview.records.length} rows ready for review</Typography.Text><div className="insuranceImportReview">{preview.records.map((record, index) => <div key={index}>{record.plateNumber} · {record.customerName} · {record.customerPhone || "No phone"} · {formatDisplayDate(record.expiryDate)}</div>)}</div></>}</Space>
  </Modal>;
}
