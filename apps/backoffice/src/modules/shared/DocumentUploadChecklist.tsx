import type { ReactNode } from "react";
import { Space, Tag, Typography } from "antd";

export type DocumentChecklistItem = {
  label: string;
  isPresent: boolean;
  action?: ReactNode;
};

export function documentChecklistProgress(items: readonly DocumentChecklistItem[]) {
  return {
    completed: items.filter((item) => item.isPresent).length,
    total: items.length
  };
}

export function DocumentUploadChecklist({
  title,
  description,
  items
}: {
  title: string;
  description: string;
  items: readonly DocumentChecklistItem[];
}) {
  const progress = documentChecklistProgress(items);

  return (
    <div className="documentUploadChecklistPanel">
      <div className="documentUploadChecklistHeader">
        <div>
          <Typography.Text strong>{title}</Typography.Text>
          <Typography.Text type="secondary">{description}</Typography.Text>
        </div>
        <Tag color={progress.completed === progress.total ? "green" : "orange"}>{progress.completed} of {progress.total} received</Tag>
      </div>
      <div className="documentUploadChecklist" aria-label={title}>
        {items.map((item) => (
          <div className="documentUploadChecklistItem" key={item.label}>
            <div>
              <Typography.Text strong>{item.label}</Typography.Text>
              <Typography.Text type="secondary">{item.isPresent ? "Uploaded and ready" : "Not uploaded yet"}</Typography.Text>
            </div>
            {item.isPresent ? (
              <Space size={6} wrap>
                <Tag color="green">Received</Tag>
                {item.action}
              </Space>
            ) : item.action}
          </div>
        ))}
      </div>
    </div>
  );
}
