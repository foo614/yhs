import { useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Form, Input, InputNumber, Modal, Popconfirm, Space, Tag, Typography } from "antd";
import { LoanBankNameInput } from "../../LoanBankNameInput";
import {
  approveLoanBank, createLoanBankOption, finalizeLoanBankLouFile, getLoanBankLouFiles,
  humanizeApiError, rejectLoanBank, reviewLoanBankLouFile, saveReviewedLoanLou,
  selectFinalLoanBank, submitLoanBank, updateLoanBankOption, vehicleDocumentContentUrl,
  type DocumentUploadOwner, type LoanApplication, type LoanBankLouFile, type LoanBankOption, type LoanLouTerms
} from "../../api";
import { OcrUploadReview } from "../shared/OcrUploadReview";

const money = (amount?: number | null) => amount == null ? "—" : `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uploadTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded / 未记录" : `${new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(date)} MYT`;
};
const colors = { Pending: "default", Submitted: "blue", Approved: "green", Rejected: "red" };

export function LoanBankComparison({ loan, banks, loading, loadError, canProcess, canSelectBank, uploadOwner, resumeOcrJobId, onRefresh }: {
  loan: LoanApplication;
  banks: LoanBankOption[];
  loading: boolean;
  loadError?: string;
  canProcess: boolean;
  canSelectBank: boolean;
  uploadOwner: DocumentUploadOwner;
  resumeOcrJobId?: string;
  onRefresh: () => Promise<void>;
}) {
  const [files, setFiles] = useState<Record<string, LoanBankLouFile[]>>({});
  const [fileError, setFileError] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [edit, setEdit] = useState<LoanBankOption | "new">();
  const [review, setReview] = useState<{ bank: LoanBankOption; file: LoanBankLouFile }>();
  const [final, setFinal] = useState<{ bank: LoanBankOption; file: LoanBankLouFile }>();
  const [reject, setReject] = useState<LoanBankOption>();
  const [rejectionReason, setRejectionReason] = useState("");
  const [resumeTarget, setResumeTarget] = useState<string>();
  const [handledResume, setHandledResume] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const [bankForm] = Form.useForm<Partial<LoanBankOption>>();
  const [fileForm] = Form.useForm<LoanLouTerms>();
  const active = loan.status !== "Done" && loan.status !== "Rejected" && loan.status !== "Draft";
  const writable = canProcess && active;
  const bankRevision = banks.map(bank => `${bank.id}:${bank.updatedAt}:${bank.louDocumentId}:${bank.editedLouDocumentId}`).join("|");

  useEffect(() => {
    let current = true;
    setFileLoading(true);
    setFileError("");
    void Promise.all(banks.map(async bank => [bank.id, await getLoanBankLouFiles(loan.id, bank.id)] as const))
      .then(result => { if (current) setFiles(Object.fromEntries(result)); })
      .catch(cause => { if (current) { setFiles({}); setFileError(humanizeApiError(cause, "LOU files could not be loaded.")); } })
      .finally(() => { if (current) setFileLoading(false); });
    return () => { current = false; };
  }, [loan.id, bankRevision, reload]);

  const refresh = async () => { setReload(value => value + 1); await onRefresh(); };
  const run = async (action: () => Promise<unknown>, close?: () => void) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try { await action(); close?.(); await refresh(); }
    catch (cause) { setError(humanizeApiError(cause, "The bank action could not be saved.")); }
    finally { pending.current = false; setBusy(false); }
  };
  const openBank = (bank?: LoanBankOption) => {
    setError(""); bankForm.resetFields(); if (bank) bankForm.setFieldsValue(bank); setEdit(bank ?? "new");
  };
  const openReview = (bank: LoanBankOption, file: LoanBankLouFile) => {
    setError(""); fileForm.resetFields();
    fileForm.setFieldsValue({ bankName: file.bankName ?? bank.bankName, loanAmount: file.loanAmount ?? undefined, interestRate: file.interestRate ?? undefined, tenureMonths: file.tenureMonths ?? undefined, terms: file.terms ?? undefined });
    setReview({ bank, file });
  };
  const reloadFinalFile = async () => {
    if (!final || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const latest = await getLoanBankLouFiles(loan.id, final.bank.id);
      const updated = latest.find(file => file.documentId === final.file.documentId);
      if (!updated?.reviewedAt) throw new Error("This file no longer has reviewed terms. Close this dialog and review the file again. / 此文件已无有效复核条款，请关闭后重新复核。");
      setFiles(current => ({ ...current, [final.bank.id]: latest }));
      setFinal(current => current ? { ...current, file: updated } : current);
      setError("");
    } catch (cause) { setError(humanizeApiError(cause, "The file could not be refreshed.")); }
    finally { pending.current = false; setBusy(false); }
  };
  const documentLink = (file: LoanBankLouFile) => <Button size="small" href={vehicleDocumentContentUrl(loan.vehicleId, file.documentId)} target="_blank" rel="noopener noreferrer">View original file / 查看原文件</Button>;
  const termsFields = (fileReview = false) => <>
    <Form.Item name="bankName" label="Bank / 银行" rules={[{ required: true, whitespace: true }]}><LoanBankNameInput /></Form.Item>
    <div className="formGridTwo">
      <Form.Item name="loanAmount" label="Loan amount / 贷款金额" rules={fileReview ? [{ required: true }] : []}><InputNumber className="fullWidth" min={0.01} precision={2} /></Form.Item>
      <Form.Item name="interestRate" label="Interest rate / 利率 (%)" rules={fileReview ? [{ required: true }] : []}><InputNumber className="fullWidth" min={0.001} precision={3} /></Form.Item>
      <Form.Item name="tenureMonths" label="Tenure / 期数 (months)" rules={fileReview ? [{ required: true }] : []}><InputNumber className="fullWidth" min={1} precision={0} /></Form.Item>
    </div>
    <Form.Item name="terms" label="Exact bank terms / 银行原文条款"><Input.TextArea rows={3} /></Form.Item>
  </>;

  return <div className="loanBankComparison">
    <div className="loanBankComparisonToolbar">
      {writable && <Button type="primary" disabled={loading || Boolean(loadError)} onClick={() => openBank()}>Add bank application / 新增银行申请</Button>}
    </div>
    {loadError && <Alert type="error" showIcon title={loadError} action={<Button onClick={() => { void onRefresh().catch(cause => setError(humanizeApiError(cause, "Applications could not be refreshed."))); }}>Retry / 重试</Button>} />}
    {error && <Alert type="error" showIcon title={error} />}
    {fileError && <Alert type="error" showIcon title={fileError} action={<Button onClick={() => setReload(value => value + 1)}>Retry / 重试</Button>} />}
    {resumeOcrJobId && handledResume !== resumeOcrJobId && writable && <Alert type="info" showIcon title="Choose the matching application’s Review pending LOU action below. / 请在对应银行申请下继续复核待处理 LOU。" />}
    {loading && <Typography.Text type="secondary">Loading applications… / 读取申请中…</Typography.Text>}
    {!loading && !loadError && banks.length === 0 && <Empty description="Add a bank application before uploading its LOU. / 请先新增银行申请，再上传其 LOU。" />}
    {banks.length > 0 && <div className="loanBankComparisonHead" aria-hidden="true"><span>Bank / 银行</span><span>Status / 状态</span><span>Amount / 金额</span><span>Rate / 利率</span><span>Tenure / 期数</span></div>}
    {banks.map(bank => <section className="loanBankComparisonRow" key={bank.id} aria-label={`${bank.bankName} application`}>
      <div className="loanBankComparisonSummary">
        <div><span className="loanBankFieldLabel">Bank / 银行</span><Typography.Text strong>{bank.bankName}</Typography.Text></div>
        <div><span className="loanBankFieldLabel">Status / 状态</span><Tag color={colors[bank.status]}>{bank.status}</Tag></div>
        <div><span className="loanBankFieldLabel">Amount / 金额</span>{money(bank.loanAmount)}</div>
        <div><span className="loanBankFieldLabel">Rate / 利率</span>{bank.interestRate == null ? "—" : `${bank.interestRate}%`}</div>
        <div><span className="loanBankFieldLabel">Tenure / 期数</span>{bank.tenureMonths == null ? "—" : `${bank.tenureMonths} months / 个月`}</div>
      </div>
      <Space wrap className="loanBankRowActions">
        {bank.isSelected && <Tag color="green">{loan.finalLouDocumentId ? "Final bank / 最终银行" : "Selected bank · final file not recorded / 已选银行 · 未记录最终文件"}</Tag>}
        {writable && bank.status !== "Rejected" && <OcrUploadReview
          key={`${bank.id}:${resumeTarget === bank.id ? resumeOcrJobId : "upload"}`}
          compact commitAfterApply vehicleId={loan.vehicleId} category="LoanDocument"
          disabled={busy}
          resumeJobId={resumeTarget === bank.id ? resumeOcrJobId : undefined}
          uploadOwner={{ ...uploadOwner, loanBankOptionId: bank.id, louPreview: true }}
          buttonLabel={`Upload / review LOU · ${bank.bankName} / 上传及复核`}
          applyLabel="Confirm this file’s bank terms / 确认此文件条款"
          fields={[
            { name: "loanBank", label: "Bank / 银行", type: "bank", required: true },
            { name: "loanAmount", label: "Loan amount / 贷款金额", type: "number", required: true },
            { name: "interestRate", label: "Interest rate / 利率 (%)", type: "number", required: true },
            { name: "loanTenureMonths", label: "Tenure / 期限 (months)", type: "number", required: true },
            { name: "loanTerms", label: "Exact bank terms / 银行原文条款", fullWidth: true }
          ]}
          onUploaded={() => { void refresh().catch(cause => setError(humanizeApiError(cause, "The uploaded file list could not be refreshed."))); }}
          onManualApply={(values, documentId) => saveReviewedLoanLou(loan.id, documentId, values, bank.id, false).then(() => undefined)}
          onApply={(values, job) => saveReviewedLoanLou(loan.id, job.documentId, values, bank.id, false).then(() => undefined)}
          onCompleted={async () => { if (resumeTarget === bank.id) { setHandledResume(resumeOcrJobId); setResumeTarget(undefined); } await refresh(); }}
        />}
        {writable && resumeOcrJobId && handledResume !== resumeOcrJobId && bank.status !== "Rejected" && <Button onClick={() => setResumeTarget(bank.id)}>Review pending LOU / 复核待处理 LOU</Button>}
        {writable && !bank.isSelected && bank.status !== "Rejected" && <Button disabled={busy} onClick={() => openBank(bank)}>Edit application / 编辑申请</Button>}
        {writable && bank.status === "Pending" && <Popconfirm title="Record bank submission / 记录已提交银行?" onConfirm={() => run(() => submitLoanBank(bank))}><Button disabled={busy}>Submitted to bank / 已提交银行</Button></Popconfirm>}
        {writable && bank.status === "Submitted" && <>
          <Popconfirm title={`Approve ${bank.bankName}? / 批准此银行？`} description="Approval does not choose a final LOU or complete the loan. / 批准不会选定最终 LOU 或完成贷款。" onConfirm={() => run(() => approveLoanBank(bank))}><Button disabled={busy || !bank.louDocumentId}>Approve / 批准</Button></Popconfirm>
          <Button danger disabled={busy} onClick={() => { setError(""); setRejectionReason(""); setReject(bank); }}>Reject / 拒绝</Button>
        </>}
        {!canProcess && canSelectBank && active && bank.status === "Approved" && !bank.isSelected && <Popconfirm title="Select this bank / 选择此银行?" onConfirm={() => run(() => selectFinalLoanBank(bank))}><Button disabled={busy}>Select bank / 选择银行</Button></Popconfirm>}
      </Space>
      {bank.rejectionReason && <Typography.Paragraph type="secondary">{bank.rejectionReason}</Typography.Paragraph>}
      {fileLoading && <Typography.Text type="secondary">Loading files… / 读取文件中…</Typography.Text>}
      {!fileLoading && !fileError && !(files[bank.id]?.length) && <Typography.Paragraph type="secondary">No LOU linked to this application. / 此申请尚未关联 LOU。</Typography.Paragraph>}
      <div className="loanBankFileList">{(files[bank.id] ?? []).map(file => <div className="loanBankFile" key={file.documentId}>
        <div className="loanBankFileInfo"><Typography.Text strong>{file.fileName}</Typography.Text><Typography.Text type="secondary">{uploadTime(file.uploadedAt)}</Typography.Text>
          {file.reviewedAt ? <Typography.Text>{money(file.loanAmount)} · {file.interestRate}% · {file.tenureMonths} months / 个月</Typography.Text> : <Typography.Text type="secondary">{file.isLegacy ? "Historical file · terms not recorded / 历史文件 · 未记录条款" : "Awaiting terms review / 待复核条款"}</Typography.Text>}
        </div>
        <Space wrap>
          {file.isFinal && <Tag color="green">Final LOU / 最终 LOU</Tag>}
          {documentLink(file)}
          {writable && bank.status !== "Rejected" && <Button disabled={busy || fileLoading} onClick={() => openReview(bank, file)}>Review file terms / 复核文件条款</Button>}
          {writable && bank.status !== "Rejected" && <Button type="primary" disabled={busy || fileLoading || !file.reviewedAt} onClick={() => { setError(""); setFinal({ bank, file }); }}>Choose final LOU / 选为最终 LOU</Button>}
        </Space>
      </div>)}</div>
    </section>)}
    <Modal centered title={edit === "new" ? "Add bank application / 新增银行申请" : "Edit bank application / 编辑银行申请"} open={Boolean(edit)} onCancel={() => { if (!busy) setEdit(undefined); }} footer={null} destroyOnHidden mask={{ closable: false }}>
      {error && <Alert type="error" title={error} />}
      <Form form={bankForm} layout="vertical" onFinish={values => run(() => edit && edit !== "new" ? updateLoanBankOption({ ...edit, ...values }) : createLoanBankOption(loan.id, { loanApplicationId: loan.id, bankName: values.bankName || "", loanAmount: values.loanAmount, interestRate: values.interestRate, tenureMonths: values.tenureMonths, terms: values.terms, isSelected: false }), () => setEdit(undefined))}>
        {termsFields()}<Button type="primary" htmlType="submit" disabled={!writable} loading={busy}>Save application / 保存申请</Button>
      </Form>
    </Modal>
    <Modal centered title="Review LOU file / 复核 LOU 文件" open={Boolean(review)} onCancel={() => { if (!busy) setReview(undefined); }} footer={null} destroyOnHidden mask={{ closable: false }}>
      {review && <Space direction="vertical" className="fullWidth">
        <Typography.Text strong>{review.bank.bankName} · {review.file.fileName}</Typography.Text>{documentLink(review.file)}
        <Typography.Paragraph>Read the original and confirm the terms for this specific file. / 请核对原文件，再确认此文件的条款。</Typography.Paragraph>
        {!review.file.reviewedAt && <Alert type="info" title="This file has no recorded terms. Enter them from the original file. / 此文件尚无条款记录，请按原文件填写。" />}
        {error && <Alert type="error" title={error} />}
        <Form form={fileForm} layout="vertical" onFinish={terms => run(() => reviewLoanBankLouFile(loan.id, review.bank.id, review.file.documentId, terms), () => setReview(undefined))}>
          {termsFields(true)}<Button type="primary" htmlType="submit" disabled={!writable} loading={busy}>Confirm file terms / 确认文件条款</Button>
        </Form>
      </Space>}
    </Modal>
    <Modal centered title="Confirm final LOU and complete loan / 确认最终 LOU 并完成贷款" open={Boolean(final)} onCancel={() => { if (!busy) setFinal(undefined); }} onOk={() => final && run(() => finalizeLoanBankLouFile(loan.id, final.bank.id, final.file), () => setFinal(undefined))} confirmLoading={busy} okButtonProps={{ disabled: !writable }} okText="Confirm final LOU & complete / 确认并完成" mask={{ closable: false }}>
      {final && <Space direction="vertical" className="fullWidth">
        <Typography.Text strong>{final.file.bankName || final.bank.bankName}</Typography.Text><Typography.Text type="secondary">Application / 申请：{final.bank.bankName}</Typography.Text><Typography.Text>{final.file.fileName}</Typography.Text><Typography.Text type="secondary">{uploadTime(final.file.uploadedAt)}</Typography.Text>
        {documentLink(final.file)}
        <Typography.Text>{money(final.file.loanAmount)} · {final.file.interestRate}% · {final.file.tenureMonths} months / 个月</Typography.Text>
        <Typography.Paragraph>{final.file.terms || "No additional terms recorded / 未记录附加条款"}</Typography.Paragraph>
        <Alert type="warning" showIcon title="Confirm the customer’s chosen file and terms. This completes the loan when all business requirements are met. / 请核对客户选定的文件与条款；业务条件齐全时将完成贷款。" />
        {error && <Alert type="error" title={error} />}
        {error && <Button loading={busy} onClick={() => void reloadFinalFile()}>Reload files / 重新读取文件</Button>}
      </Space>}
    </Modal>
    <Modal centered title="Bank rejection / 银行拒绝" open={Boolean(reject)} onCancel={() => { if (!busy) setReject(undefined); }} onOk={() => reject && run(() => rejectLoanBank(reject, rejectionReason.trim()), () => setReject(undefined))} okButtonProps={{ disabled: !writable || !rejectionReason.trim() }} confirmLoading={busy} mask={{ closable: false }}>
      <Input.TextArea value={rejectionReason} maxLength={500} onChange={event => setRejectionReason(event.target.value)} placeholder="Reason / 原因" />
      {error && <Alert type="error" title={error} />}
    </Modal>
  </div>;
}
