import { useEffect, useRef, useState } from "react";
import { DownloadOutlined, EyeOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";
import { humanizeApiError } from "../../api";
import { DocumentPreviewDrawer, type DocumentPreviewSource } from "./DocumentPreviewDrawer";

export function DocumentPreviewButton({
  fileName,
  mimeType,
  downloadUrl,
  loadContent,
  previewLabel = "Preview",
  downloadLabel = "Download"
}: {
  fileName: string;
  mimeType?: string;
  downloadUrl: string;
  loadContent: () => Promise<Blob>;
  previewLabel?: string;
  downloadLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMimeType, setPreviewMimeType] = useState(mimeType ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  return (
    <>
      <Space className="tableActionGroup" size={6} wrap>
        <Button size="small" type="primary" icon={<EyeOutlined />} onClick={() => void openPreview()}>
          {previewLabel}
        </Button>
        <Button size="small" icon={<DownloadOutlined />} href={downloadUrl} target="_blank" rel="noreferrer">
          {downloadLabel}
        </Button>
      </Space>
      <DocumentPreviewDrawer
        open={open}
        title="Document preview / 文件预览"
        source={source}
        loading={loading}
        error={error}
        onClose={close}
        footer={(
          <div className="documentPreviewFooter documentPreviewFooterActionsOnly">
            <Typography.Text type="secondary">Preview is read-only. Download the original file when needed.</Typography.Text>
            <Button icon={<DownloadOutlined />} href={downloadUrl} target="_blank" rel="noreferrer">Download original</Button>
          </div>
        )}
      />
    </>
  );
}
