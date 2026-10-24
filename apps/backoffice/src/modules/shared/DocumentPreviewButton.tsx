import { useEffect, useRef, useState } from "react";
import { DownloadOutlined, EyeOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";
import { getProtectedFileDownload, humanizeApiError } from "../../api";
import { DocumentPreviewDrawer, type DocumentPreviewSource } from "./DocumentPreviewDrawer";

export function DocumentPreviewButton({
  fileName,
  mimeType,
  downloadUrl,
  loadContent,
  previewLabel = "Preview",
  downloadLabel = "Download",
  fullWidth = false
}: {
  fileName: string;
  mimeType?: string;
  downloadUrl: string;
  loadContent: () => Promise<Blob>;
  previewLabel?: string;
  downloadLabel?: string;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMimeType, setPreviewMimeType] = useState(mimeType ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const close = () => {
    requestId.current += 1;
    setOpen(false);
    setPreviewUrl("");
    setPreviewMimeType(mimeType ?? "");
    setLoading(false);
    setError("");
  };

  const openPreview = async () => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    setOpen(true);
    setPreviewUrl("");
    setPreviewMimeType(mimeType ?? "");
    setError("");

    setLoading(true);
    try {
      const blob = await loadContent();
      if (requestId.current !== currentRequestId) return;
      setPreviewMimeType(blob.type || mimeType || "application/octet-stream");
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (reason) {
      if (requestId.current === currentRequestId) {
        setError(humanizeApiError(reason, "Unable to load this document preview."));
      }
    } finally {
      if (requestId.current === currentRequestId) setLoading(false);
    }
  };

  const source: DocumentPreviewSource = { fileName, mimeType: previewMimeType || "application/octet-stream", url: previewUrl };

  const download = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      const file = await getProtectedFileDownload(downloadUrl, "Unable to download this document");
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.fileName || fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setDownloadError(humanizeApiError(reason, "Unable to download this document. Please try again."));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Space className={fullWidth ? "tableActionGroup documentPreviewButtonActionsFullWidth" : "tableActionGroup"} size={6} wrap>
        <Button size="small" type="primary" icon={<EyeOutlined />} onClick={() => void openPreview()}>
          {previewLabel}
        </Button>
        <Button size="small" icon={<DownloadOutlined />} loading={downloading} onClick={() => void download()}>
          {downloadLabel}
        </Button>
      </Space>
      {downloadError && <Typography.Paragraph type="danger" role="alert" className="documentDownloadError">{downloadError}</Typography.Paragraph>}
      <DocumentPreviewDrawer
        open={open}
        title="Document preview / 文件预览"
        source={source}
        loading={loading}
        error={error}
        onClose={close}
        footer={(
          <div className="documentPreviewFooter documentPreviewFooterActionsOnly">
            <div>
              <Typography.Text type="secondary">Read-only preview. If it cannot be displayed, download the file.</Typography.Text>
              {downloadError && <Typography.Paragraph type="danger" role="alert" className="documentDownloadError">{downloadError}</Typography.Paragraph>}
            </div>
            <Button icon={<DownloadOutlined />} loading={downloading} onClick={() => void download()}>{downloadLabel}</Button>
          </div>
        )}
      />
    </>
  );
}
