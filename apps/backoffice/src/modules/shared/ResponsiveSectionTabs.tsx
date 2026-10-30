import { useEffect, useId, useState } from "react";
import { Select, Tabs, type TabsProps } from "antd";
import "./responsiveSectionTabs.css";

export function ResponsiveSectionTabs({ sectionLabel, items = [], activeKey, defaultActiveKey, onChange, className, ...props }: TabsProps & { sectionLabel: string }) {
  const selectorId = useId();
  const [internalKey, setInternalKey] = useState(defaultActiveKey);
  const requestedKey = activeKey ?? internalKey;
  const selectedKey = items.find(item => item.key === requestedKey && !item.disabled)?.key
    ?? items.find(item => !item.disabled)?.key;

  useEffect(() => {
    if (activeKey === undefined) setInternalKey(selectedKey);
  }, [activeKey, selectedKey]);

  const changeSection = (key: string) => {
    if (!items.some(item => item.key === key && !item.disabled)) return;
    if (activeKey === undefined) setInternalKey(key);
    onChange?.(key);
  };

  return <div className="responsiveSectionTabs">
    <div className="responsiveSectionPicker">
      <label htmlFor={selectorId}>{sectionLabel}</label>
      <Select
        id={selectorId}
        className="responsiveSectionSelect"
        size="large"
        value={selectedKey}
        onChange={changeSection}
        options={items.map(item => ({ value: item.key, label: item.label, disabled: item.disabled }))}
        popupMatchSelectWidth
        popupClassName="responsiveSectionDropdown"
      />
    </div>
    <Tabs {...props} className={["responsiveSectionTabPanels", className].filter(Boolean).join(" ")} items={items} activeKey={selectedKey ?? ""} onChange={changeSection} />
  </div>;
}
