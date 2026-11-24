import { dialogWidths } from "../shared/dialogSizing";
import { BusinessDialog } from "../shared/BusinessDialog";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { InfoCircleOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { Alert, AutoComplete, Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Tooltip, Typography, Upload, message } from "antd";
import { confirmInsuranceImport, getInsuranceChargeItems, previewInsuranceImport, previewInsuranceReceipt, recordInsuranceInsurerPayment, saveInsuranceCase, type InsuranceCase, type InsuranceCaseView, type InsuranceImportInput, type InsuranceImportPreview, type InsuranceReceipt, type InsuranceReceiptInput } from "../../api";
import { formatDisplayDate } from "../../dateDisplay";
import { insuranceCompanies } from "../../insuranceCompanies";
import { calculateInsuranceRoadTax, roadTaxExpiryFromInsurance } from "./InsuranceRoadTax";

function InsuranceHint({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip title={children} trigger={["hover", "focus", "click"]}><Button type="text" size="small" aria-label={label} icon={<InfoCircleOutlined />} /></Tooltip>;
}
const guidanceTooltip = (title: ReactNode, label: string) => ({ title, trigger: ["hover", "focus", "click"] as ("hover" | "focus" | "click")[], icon: <Button type="text" size="small" aria-label={label} icon={<InfoCircleOutlined />} /> });
const failure = (error: unknown) => error instanceof Error ? error.message : "Unable to complete this request.";
type CaseForm = Omit<InsuranceCase, "expiryDate" | "coverStartDate" | "roadTaxExpiryDate"> & { expiryDate: Dayjs; coverStartDate?: Dayjs; roadTaxExpiryDate?: Dayjs };
type MoneyForm = Omit<InsuranceReceiptInput, "idempotencyKey" | "receivedDate" | "invoiceNumber"> & { receivedDate: Dayjs; paidDate: Dayjs; reference: string };
const headers = ["NAME", "IC NO.", "CUSTOMER PHONE NUMBER", "VEHICLE NO.", "EXP DATE", "INSURANCE", "COVERAGE", "NCD", "RENEWAL/NEW", "REMARK"];

export function InsuranceCaseForm({ record, insurerNames = [], onClose, onSaved }: { record?: InsuranceCase; insurerNames?: string[]; onClose: () => void; onSaved: (saved: InsuranceCaseView) => Promise<void> }) {
  const [form] = Form.useForm<CaseForm>();
  const insurers = [...insuranceCompanies, ...insurerNames, record?.insurer ?? ""].filter((value, index, names) => value && names.findIndex(name => name.toLowerCase() === value.toLowerCase()) === index);
  const coverages = ["Third Party, Fire & Theft", "Comprehensive Plus", "Comprehensive", "Comprehensive Premier"];
  if (record?.coverage && !coverages.includes(record.coverage)) coverages.push(record.coverage);
  const [busy, setBusy] = useState(false);
  const creationDirty = useRef(false);
  const [manualRoadTaxExpiry, setManualRoadTaxExpiry] = useState(false);
  const [roadTaxInputs, setRoadTaxInputs] = useState({ region: "", vehicleClass: "", fuel: "", capacity: undefined as number | null | undefined });
  const [chargeItems, setChargeItems] = useState<{ itemCode: string; description: string }[]>([]);
  const [chargeItemsLoading, setChargeItemsLoading] = useState(true);
  const [chargeItemsError, setChargeItemsError] = useState("");
  const [chargeItemsRefresh, setChargeItemsRefresh] = useState(0);
  const chargeRows = Form.useWatch("otherCharges", form);
  useEffect(() => {
    let active = true;
    setChargeItemsLoading(true); setChargeItemsError("");
    void getInsuranceChargeItems().then(items => { if (active) setChargeItems(items); })
      .catch(error => { if (active) setChargeItemsError(failure(error)); })
      .finally(() => { if (active) setChargeItemsLoading(false); });
    return () => { active = false; };
  }, [chargeItemsRefresh]);
  const roadTaxMethod = Form.useWatch("roadTaxMethod", form);
  const roadTaxMonths = Form.useWatch("roadTaxMonths", form);
  const insuranceExpiry = Form.useWatch("expiryDate", form)?.format("YYYY-MM-DD");
  const roadTaxCalculation = calculateInsuranceRoadTax({ ...roadTaxInputs, months: roadTaxMonths });
  const calculatedAmount = "amount" in roadTaxCalculation ? roadTaxCalculation.amount : undefined;
  const calculationReason = "reason" in roadTaxCalculation ? roadTaxCalculation.reason : "";
  const manualAmountRequired = "manualRequired" in roadTaxCalculation && roadTaxCalculation.manualRequired === true;
  const automaticAmount = !record && !manualAmountRequired && roadTaxMethod !== "None";
  useEffect(() => {
    if (!record) form.setFieldValue("roadTaxAmount", roadTaxMethod === "None" ? 0 : calculatedAmount);
  }, [form, record, roadTaxMethod, calculatedAmount, roadTaxInputs, roadTaxMonths]);
  useEffect(() => {
    if (record || manualRoadTaxExpiry) return;
    const date = roadTaxMethod === "None" ? null : roadTaxExpiryFromInsurance(insuranceExpiry, roadTaxMonths);
    form.setFieldValue("roadTaxExpiryDate", date ? dayjs(date) : undefined);
  }, [form, record, manualRoadTaxExpiry, roadTaxMethod, insuranceExpiry, roadTaxMonths]);
  function changeRoadTaxInputs(next: Partial<typeof roadTaxInputs>) {
    creationDirty.current = true;
    setRoadTaxInputs(prior => ({ ...prior, ...next }));
  }
  function closeCaseForm() {
    if (busy) return;
    if (!record && creationDirty.current) {
      Modal.confirm({ centered: true, width: dialogWidths.compact, title: "Discard this new case? / 放弃新个案？", content: "Unsaved case details will be lost.", okText: "Discard case / 放弃个案", okButtonProps: { danger: true }, onOk: onClose });
    } else onClose();
  }
  const caseType = Form.useWatch("caseType", form);
  const initialValues = record ? { ...record, expiryDate: dayjs(record.expiryDate), coverStartDate: record.coverStartDate ? dayjs(record.coverStartDate) : undefined, roadTaxExpiryDate: record.roadTaxExpiryDate ? dayjs(record.roadTaxExpiryDate) : undefined } : { id: crypto.randomUUID(), version: 0, caseType: "New", company: "Automotive", insurer: "", coverage: "", renewalDeclined: false, roadTaxMethod: "None", roadTaxMonths: 12, roadTaxCompleted: false, insuranceAmount: 0, roadTaxAmount: 0, runnerFee: 0, discount: 0, otherCharges: [], specialJpjSale: false };
  function save(values: CaseForm) {
    const payload: InsuranceCase = { ...values, invoiceNumber: record?.invoiceNumber ?? null, intercompanyInvoiceNumber: record?.intercompanyInvoiceNumber ?? null, runnerFee: values.roadTaxMethod === "JPJ" ? values.runnerFee : 0, expiryDate: values.expiryDate.format("YYYY-MM-DD"), coverStartDate: values.coverStartDate?.format("YYYY-MM-DD") ?? null, roadTaxExpiryDate: values.roadTaxExpiryDate?.format("YYYY-MM-DD") ?? null };
    Modal.confirm({ centered: true, width: dialogWidths.compact, title: record ? "Save case changes? / 保存更改？" : "Create standalone case? / 新增独立个案？", content: `${payload.plateNumber} · ${payload.customerName}. Confirm dates, charges and renewal status.`, okText: "Confirm save / 确认保存", onOk: async () => { setBusy(true); try { await onSaved(await saveInsuranceCase(payload, !!record)); message.success("Insurance case saved."); } catch (e) { message.error(failure(e)); throw e; } finally { setBusy(false); } } });
  }
  const contents = <>
    <Form form={form} layout="vertical" initialValues={initialValues} onFinish={save} onValuesChange={() => { creationDirty.current = true; }}>
      <Form.Item name="id" hidden><Input /></Form.Item><Form.Item name="version" hidden><InputNumber /></Form.Item>
      <div className="formGrid">
        <Form.Item name="plateNumber" label="Plate / 车牌" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
        <Form.Item name="customerName" label="Customer name / 客户姓名" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
        <Form.Item name="customerPhone" label="Customer phone / 客户电话" tooltip={{
          title: "Optional for internal renewal reminders",
          trigger: ["hover", "focus", "click"],
          icon: <Button type="text" size="small" aria-label="Customer phone guidance" icon={<InfoCircleOutlined />} />
        }}><Input type="tel" /></Form.Item>
        <Form.Item name="identityNumber" label="IC / company number / 身份证或公司号码"><Input /></Form.Item>
        <Form.Item name="caseType" label="Case type / 个案类型" rules={[{ required: true }]}><Select options={[{ value: "New", label: "New / 新保" }, { value: "Renewal", label: "Renewal / 续保" }, { value: "BankArranged", label: "Bank-arranged / 银行安排" }]} /></Form.Item>
        <Form.Item name="company" label="Customer invoice book / 客户发票公司"><Select options={[{ value: "Automotive", label: "YS Heng Automotive (default)" }, { value: "Auto", label: "YS Heng Auto · cash customer" }]} /></Form.Item>
        {caseType === "BankArranged" && <><Form.Item name="bankCreditorName" label="Actual bank creditor / 实际银行债权人"><Input /></Form.Item><Form.Item name="bankInvoiceNumber" label="Bank invoice number / 银行发票号码"><Input /></Form.Item></>}
        <Form.Item name="insurer" label="Insurer / 保险公司"><AutoComplete options={insurers.map(value => ({ value }))} filterOption={(input, option) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase())} /></Form.Item><Form.Item name="coverage" label="Coverage / 保障"><Select options={coverages.map(value => ({ value, label: value }))} /></Form.Item>
        <Form.Item name="ncd" label="NCD (%)"><InputNumber min={0} max={100} className="fullWidth" /></Form.Item>
        <Form.Item name="policyNumber" label="Policy number / 保单号码"><Input /></Form.Item>
        <Form.Item name="coverStartDate" label="Policy effective date / 保单生效日期"><DatePicker className="fullWidth" format="DD MMM YYYY" /></Form.Item>
        <Form.Item name="expiryDate" label="Insurance expiry / 保险到期日" rules={[{ required: true }]}><DatePicker className="fullWidth" format="DD MMM YYYY" /></Form.Item>
        <Form.Item name="roadTaxMethod" label="Road tax method / 路税方式"><Select onChange={value => form.setFieldValue("runnerFee", value === "JPJ" ? 20 : 0)} options={[{ value: "None", label: "Not required / 无需" }, { value: "JPJ", label: "JPJ runner / 跑腿" }, { value: "EAuto", label: "eAuto" }]} /></Form.Item>
        <Form.Item name="roadTaxMonths" label="Road tax period / 路税期限"><Select options={[{ value: 6, label: "6 months / 半年" }, { value: 12, label: "12 months / 一年" }]} /></Form.Item>
        {!record && roadTaxMethod !== "None" && <section className="insuranceRoadTaxCalculator" aria-label="Road tax calculator / 路税计算">
          <Space><Typography.Text strong>Road tax calculator / 路税计算</Typography.Text><InsuranceHint label="Road tax calculator guidance"><span>{calculationReason && <>{calculationReason}<br /></>}Standard private AB/AC/AD/AE only. Use the registered JPJ class and declared region. Concessions and unverified rates require a manual JPJ quote. Runner fee is separate. Current rates checked 22 Nov 2026. <a href="https://www.jpj.gov.my/pusat-media-3/informasi-perkhidmatan-jpj/kenderaan/panduan-pengiraan-kadar-lkm/" target="_blank" rel="noreferrer">JPJ rate guidance</a></span></InsuranceHint></Space>
            <div className="formGrid">
              <Form.Item label="Declared region / 注册地区" htmlFor="insuranceRoadTaxRegion"><Select id="insuranceRoadTaxRegion" value={roadTaxInputs.region || undefined} onChange={region => changeRoadTaxInputs({ region })} options={[{ value: "Peninsular", label: "Peninsular Malaysia" }, { value: "Sabah", label: "Sabah" }, { value: "Sarawak", label: "Sarawak" }, { value: "Other", label: "Islands / other / concession" }]} /></Form.Item>
              <Form.Item label="Registered JPJ class / JPJ 注册类别" htmlFor="insuranceRoadTaxClass"><Select id="insuranceRoadTaxClass" value={roadTaxInputs.vehicleClass || undefined} onChange={vehicleClass => changeRoadTaxInputs({ vehicleClass })} options={[{ value: "AB", label: "AB · Private saloon · Individual" }, { value: "AC", label: "AC · Private saloon · Company" }, { value: "AD", label: "AD · Private non-saloon · Individual" }, { value: "AE", label: "AE · Private non-saloon · Company" }, { value: "Other", label: "Other / concession" }]} /></Form.Item>
              <Form.Item label="Registered fuel / 注册燃料" htmlFor="insuranceRoadTaxFuel"><Select id="insuranceRoadTaxFuel" value={roadTaxInputs.fuel || undefined} onChange={fuel => changeRoadTaxInputs({ fuel, capacity: undefined })} options={[{ value: "Petrol", label: "Petrol" }, { value: "Diesel", label: "Diesel" }, { value: "GreenDiesel", label: "Green diesel" }, { value: "EV", label: "Battery electric / ZEV" }, { value: "Other", label: "Other / unconfirmed" }]} /></Form.Item>
              <Form.Item label={roadTaxInputs.fuel === "EV" ? "Registered motor power (kW) / 注册功率" : "Registered engine capacity (cc) / 注册排量"} htmlFor="insuranceRoadTaxCapacity"><InputNumber id="insuranceRoadTaxCapacity" min={0} step={roadTaxInputs.fuel === "EV" ? 0.001 : 1} value={roadTaxInputs.capacity} onChange={capacity => changeRoadTaxInputs({ capacity })} className="fullWidth" /></Form.Item>
            </div>
            <Typography.Text strong>{calculatedAmount !== undefined ? `Calculated road tax: RM ${calculatedAmount.toFixed(2)} · ${roadTaxMonths} months` : manualAmountRequired ? "Manual JPJ quote required / 需手动输入 JPJ 金额" : "Calculation incomplete / 计算资料未完整"}</Typography.Text>
        </section>}
        <Form.Item name="roadTaxExpiryDate" label="Road tax expiry / 路税到期日" tooltip={guidanceTooltip(record ? "Saved dates are retained until you change them." : `${manualRoadTaxExpiry ? "This date was set manually. Use suggested expiry to resume syncing. " : ""}12 months uses Insurance expiry. 6 months subtracts six calendar months, clamping to the last valid day.`, "Road tax expiry guidance")} extra={!record && manualRoadTaxExpiry && <Button type="link" onClick={() => setManualRoadTaxExpiry(false)}>Use suggested expiry / 使用建议日期</Button>}><DatePicker className="fullWidth" format="DD MMM YYYY" onChange={() => setManualRoadTaxExpiry(true)} /></Form.Item>
        <Form.Item name="insuranceAmount" label="Policy / quoted insurance (RM)" rules={[{ required: true }]}><InputNumber min={0} precision={2} className="fullWidth" /></Form.Item>
        <Form.Item name="roadTaxAmount" label="Road tax (RM) / 路税" tooltip={guidanceTooltip(record ? "Saved road tax amount. Change it only to match the verified JPJ amount." : manualAmountRequired ? calculationReason : "Calculated automatically from the selected JPJ inputs. The runner fee is separate.", "Road tax amount guidance")} rules={[{ required: roadTaxMethod !== "None", message: "Enter the JPJ road tax amount." }, { validator: () => automaticAmount && calculatedAmount === undefined ? Promise.reject(new Error(calculationReason)) : Promise.resolve() }]}><InputNumber disabled={automaticAmount} min={0} precision={2} className="fullWidth" /></Form.Item>
        <Form.Item name="runnerFee" label="Runner fee (RM) / 跑腿费"><InputNumber disabled={roadTaxMethod !== "JPJ"} min={0} precision={2} className="fullWidth" /></Form.Item>
        <Form.Item name="discount" label="Customer discount (RM) / 客户折扣"><InputNumber min={0} precision={2} className="fullWidth" /></Form.Item>
        <Form.Item name="insurerInvoiceNumber" label="Insurer invoice number / 保险发票号码"><Input /></Form.Item>
      </div>
      <div className="insuranceCheckRow"><Form.Item name="roadTaxCompleted" valuePropName="checked"><Checkbox>Road tax completed / 路税已完成</Checkbox></Form.Item><InsuranceHint label="Road tax completion guidance">JPJ completion requires a linked receipt.</InsuranceHint></div>
      <div className="insuranceCheckRow"><Form.Item name="renewalDeclined" valuePropName="checked"><Checkbox>Customer declined renewal / 客户拒绝续保</Checkbox></Form.Item><InsuranceHint label="Renewal reminder guidance">Stops future renewal reminders.</InsuranceHint></div>
      <Form.Item name="specialJpjSale" valuePropName="checked"><Checkbox>Special JPJ charges paid on customer's behalf / 特别 JPJ 代付</Checkbox></Form.Item>
      {chargeItemsError && <Alert type="error" showIcon title="Charge items unavailable" description={chargeItemsError} action={<Button onClick={() => setChargeItemsRefresh(value => value + 1)}>Retry</Button>} />}
      <Form.List name="otherCharges">{(fields, { add, remove }) => <Space direction="vertical" className="fullWidth"><Typography.Text strong>Other charges / 其他费用</Typography.Text>{fields.map(field => <div className="insuranceCharge" key={field.key}><Form.Item name={[field.name, "itemCode"]} label="Item code" tooltip={guidanceTooltip(chargeRows?.[field.name]?.description || "Select an item to view its standard description.", "Charge description guidance")} rules={[{ required: true }]}><Select loading={chargeItemsLoading} options={chargeItems.map(item => ({ value: item.itemCode, label: item.itemCode }))} onChange={value => form.setFieldValue(["otherCharges", field.name, "description"], chargeItems.find(item => item.itemCode === value)?.description ?? "")} /></Form.Item><Form.Item name={[field.name, "description"]} hidden><Input /></Form.Item><Form.Item name={[field.name, "amount"]} label="Amount (RM)" rules={[{ required: true }]}><InputNumber min={0} precision={2} className="fullWidth" /></Form.Item><Button onClick={() => remove(field.name)}>Remove</Button></div>)}<Button disabled={chargeItemsLoading || !!chargeItemsError} onClick={() => add({ itemCode: "", description: "", amount: 0 })}>Add charge / 新增费用</Button></Space>}</Form.List>
      <Form.Item name="remark" label="Remark / 备注"><Input.TextArea rows={2} /></Form.Item>
    </Form>
  </>;
  const footer = <Space wrap><Button disabled={busy} onClick={closeCaseForm}>Cancel</Button><Button type="primary" loading={busy} onClick={() => form.submit()}>Review & save / 检查保存</Button></Space>;
  const title = <Space>{record ? "Edit insurance case / 编辑保险个案" : "New insurance case / 新增保险个案"}<InsuranceHint label="Insurance case guidance">Enter this case's plate and customer details directly. Quote values are internal; quotation text, PDF and automatic sending are on hold.</InsuranceHint></Space>;
  return record ? <BusinessDialog mask={{ closable: false }} title={title} open onClose={closeCaseForm} width={dialogWidths.formWide} className="insuranceDrawer" footer={footer}>{contents}</BusinessDialog>
    : <Modal title={title} centered open onCancel={closeCaseForm} width={dialogWidths.formWide} className="recordCreateModal insuranceCaseModal" mask={{ closable: false }} closable={!busy} keyboard={!busy} styles={{ body: { maxHeight: "calc(100dvh - 200px)", overflowY: "auto" } }} footer={footer}>{contents}</Modal>;
}

export function InsuranceMoneyForm({ kind, selected, onClose, onSaved }: { kind: "receipt" | "insurer"; selected: InsuranceCaseView; onClose: () => void; onSaved: (receipt?: InsuranceReceipt) => Promise<void> }) {
  const [form] = Form.useForm<MoneyForm>();
  const [busy, setBusy] = useState(false);
  const idempotency = useRef(crypto.randomUUID());
  const receipt = kind === "receipt";
  async function save(values: MoneyForm) {
    setBusy(true);
    try {
      if (receipt) await onSaved(await previewInsuranceReceipt(selected.record.id, { amount: values.amount, invoiceNumber: selected.record.invoiceNumber ?? "", paymentType: values.paymentType, depositAccount: values.depositAccount, evidenceAttachmentId: values.evidenceAttachmentId, receivedDate: values.receivedDate.format("YYYY-MM-DD"), idempotencyKey: idempotency.current }));
      else { await recordInsuranceInsurerPayment(selected.record.id, { amount: values.amount, reference: values.reference, paidDate: values.paidDate.format("YYYY-MM-DD"), idempotencyKey: idempotency.current }); await onSaved(); message.success("Actual insurer payment recorded."); }
    } catch (e) { message.error(failure(e)); }
    finally { setBusy(false); }
  }
  return <Modal width={dialogWidths.form} centered mask={{ closable: false }} title={<Space>{receipt ? "Customer receipt / 客户收款" : "Final actual insurer payment / 最终保险付款"}<InsuranceHint label="Insurance payment guidance">{receipt ? "A pending receipt does not reduce outstanding. Review the case, invoice book and amount, then explicitly confirm actual funds." : "Enter the final full amount actually paid to the insurer once. This amount calculates commission and does not settle customer outstanding."}</InsuranceHint></Space>} open onCancel={() => !busy && onClose()} onOk={() => form.submit()} okText={receipt ? "Preview receipt / 预览收款" : "Confirm final insurer settlement"} confirmLoading={busy}>
    <Form form={form} layout="vertical" onFinish={values => void save(values)} initialValues={{ amount: receipt ? selected.outstanding : undefined, receivedDate: dayjs(), paidDate: dayjs(), paymentType: "Transfer", depositAccount: "PBB" }}>
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
  return <Modal centered mask={{ closable: false }} title="Import existing listing / 导入旧名单" open onCancel={() => !busy && onClose()} width={dialogWidths.data} footer={<Space wrap><Button onClick={onClose} disabled={busy}>Cancel</Button><Button loading={busy} onClick={() => void showPreview()}>Preview import / 预览导入</Button><Button type="primary" loading={busy} disabled={!preview?.records.length || !!preview.errors.length || !input} onClick={() => void (async () => { if (!input) return; setBusy(true); try { await confirmInsuranceImport({ ...input, idempotencyKey: idempotency.current }); await onSaved(); message.success("Listing imported."); } catch (e) { message.error(failure(e)); } finally { setBusy(false); } })()}>Confirm import / 确认导入</Button></Space>}>
    <Space direction="vertical" className="fullWidth"><InsuranceHint label="Listing import guidance">Copy the listing cells from your spreadsheet, including its header row. Place CUSTOMER PHONE NUMBER immediately after the IC NO. column. Older phone-last or no-phone templates are also supported. Use day/month/year expiry dates. Missing phone numbers still allow internal reminders.</InsuranceHint><Typography.Text code>{headers.join(" | ")}</Typography.Text><Upload accept=".tsv,.txt" showUploadList={false} beforeUpload={file => { void file.text().then(change); return Upload.LIST_IGNORE; }}><Button>Choose listing file / 选择名单文件</Button></Upload><Input.TextArea rows={8} value={text} aria-label="Tab-separated listing including header row" onChange={event => change(event.target.value)} />{preview && <>{preview.errors.map((item, index) => <Alert key={index} type="error" title={item} />)}<Typography.Text strong>{preview.records.length} rows ready for review</Typography.Text><div className="insuranceImportReview">{preview.records.map((record, index) => <div key={index}>{record.plateNumber} · {record.customerName} · {record.customerPhone || "No phone"} · {formatDisplayDate(record.expiryDate)}</div>)}</div></>}</Space>
  </Modal>;
}
