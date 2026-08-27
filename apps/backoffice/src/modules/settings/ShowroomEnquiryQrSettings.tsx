import { DownloadOutlined, PrinterOutlined, QrcodeOutlined } from "@ant-design/icons";
import { QRCodeSVG } from "qrcode.react";
import { Alert, Button, Space, Typography } from "antd";
import { useRef } from "react";
import { showroomEnquiryUrl } from "./ShowroomEnquiryQr";

export function ShowroomEnquiryQrSettings() {
  const qrPreviewRef = useRef<HTMLDivElement>(null);
  const url = showroomEnquiryUrl();
  const qrSvg = () => qrPreviewRef.current?.querySelector("svg");

  const download = () => {
    const svg = qrSvg();
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "ys-heng-showroom-enquiry-qr.svg";
    link.click();
    URL.revokeObjectURL(href);
  };

  const print = () => {
    const svg = qrSvg();
    if (!svg) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.opener = null;
    printWindow.document.write(`<!doctype html><html><head><title>YS Heng showroom enquiry QR</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px;color:#1b1819}svg{width:360px;height:360px}p{font-size:14px;word-break:break-all}</style></head><body><h1>YS Heng Auto</h1><h2>Showroom enquiry</h2>${new XMLSerializer().serializeToString(svg)}<p>${url}</p></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <Alert type="info" showIcon message="Stable shop QR" description="Place this QR in the showroom. It opens the public no-login enquiry flow and new submissions are labelled In-store QR enquiry for Sales." />
      <div ref={qrPreviewRef} className="showroomQrPreview"><QRCodeSVG value={url} size={260} includeMargin /></div>
      <Typography.Text strong>Public showroom enquiry URL</Typography.Text>
      <Typography.Paragraph copyable={{ text: url }} code>{url}</Typography.Paragraph>
      <Space wrap>
        <Button icon={<QrcodeOutlined />} href={url} target="_blank">Open public flow</Button>
        <Button icon={<DownloadOutlined />} onClick={download}>Download QR</Button>
        <Button icon={<PrinterOutlined />} onClick={print}>Print QR</Button>
      </Space>
    </Space>
  );
}
