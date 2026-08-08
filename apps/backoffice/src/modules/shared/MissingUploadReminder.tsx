import { Button, Space, Tag } from "antd";
import { Alert } from "antd";

export type UploadReminderItem = {
  label: string;
  isPresent: boolean;
};

export function missingUploadItems(items: readonly UploadReminderItem[]) {
  return items.filter((item) => !item.isPresent);
}

export function MissingUploadReminder({
  items,
  title = "Missing uploads / 缺少上传文件",
  description = "Uploads stay optional during data entry. Add the missing file when it is available.",
  onAction,
  actionLabel = "Choose a missing document type"
}: {
  items: readonly UploadReminderItem[];
  title?: string;
  description?: string;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const missing = missingUploadItems(items);
  if (missing.length === 0) return null;

  return (
    <Alert
      type="error"
      showIcon
      message={title}
      description={(
        <Space direction="vertical" size={8} className="fullWidth">
          <span>{description}</span>
          <Space wrap>
            {missing.map((item) => <Tag color="red" key={item.label}>Missing {item.label}</Tag>)}
          </Space>
          {onAction ? <Button size="small" onClick={onAction}>{actionLabel}</Button> : null}
        </Space>
      )}
    />
  );
}
