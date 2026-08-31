import { useEffect, useState } from "react";
import { UploadOutlined } from "@ant-design/icons";
import { Button, Progress, Space, Typography, Upload } from "antd";
import type { UploadProgressHandler } from "../../api";
import { DocumentPreviewDrawer, documentPreviewKind, type DocumentPreviewSource } from "./DocumentPreviewDrawer";

export function PreviewDocumentUpload({
  documentLabel,
  buttonLabel,
  onUpload
}: {
  documentLabel: string;
  buttonLabel: string;
  onUpload: (file: File, onProgress: UploadProgressHandler) => Promise<void>;
}) {
  const [file, setFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file || documentPreviewKind(file.type) === "unsupported") {
      setPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const close = () => {
    if (uploading) return;
    setOpen(false);
    setFile(undefined);
    setProgress(0);
    setError("");
  };

  const confirmUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError("");
    try {
      await onUpload(file, setProgress);
      setOpen(false);
      setFile(undefined);
      setProgress(0);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload this file.");
    } finally {
      setUploading(false);
    }
  };

  const source: DocumentPreviewSource | undefined = file
    ? { fileName: file.name, mimeType: file.type || "application/octet-stream", url: previewUrl }
    : undefined;

  return (
    <>
      <Upload
        showUploadList={false}
        beforeUpload={(nextFile) => {
          setFile(nextFile);
          setProgress(0);
          setError("");
          setOpen(true);
          return Upload.LIST_IGNORE;
        }}
      >
        <Button type="primary" size="small" icon={<UploadOutlined />}>{buttonLabel}</Button>
      </Upload>
      <DocumentPreviewDrawer
        open={open}
        title={`Review ${documentLabel} / 检查文件`}
        source={source}
        error={error}
        onClose={close}
        footer={(
          <div className="documentPreviewFooter">
            <div>
              <Typography.Text type="secondary">Confirm the document and category before uploading. Maximum 10 MB.</Typography.Text>
              {uploading && <Progress percent={progress} size="small" status="active" />}
            </div>
            <Space wrap>
              <Button onClick={close} disabled={uploading}>Cancel</Button>
              <Button type="primary" onClick={() => void confirmUpload()} loading={uploading} disabled={!file}>
                Confirm upload
              </Button>
            </Space>
          </div>
        )}
      />
    </>
  );
}
