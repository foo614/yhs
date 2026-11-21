import { useState } from "react";
import { Input, Select, Space } from "antd";
import { settlementBanks } from "./settlementBanks";

// Reuse the existing BNM-sourced suggestions, not a list of lending partners.
// Verified against https://www.bnm.gov.my/regulations/fsp-directory on 21 Nov 2026.
const bankOptions = settlementBanks.map(value => ({
  value,
  label: value === "Malayan Banking Berhad" ? `${value} (Maybank)` : value
}));
const otherBank = "__other_bank__";

export function LoanBankNameInput({ value, onChange, id }: {
  value?: string;
  onChange?: (value: string) => void;
  id?: string;
}) {
  const [manual, setManual] = useState(value === "" || Boolean(value && !settlementBanks.includes(value)));
  const isManual = manual || Boolean(value && !settlementBanks.includes(value));
  return (
    <Space orientation="vertical" className="fullWidth">
      <Select
        id={isManual ? undefined : id}
        aria-label={isManual ? "Choose bank / 选择银行" : undefined}
        className="fullWidth"
        showSearch
        optionFilterProp="label"
        placeholder="Select bank / 选择银行"
        value={isManual ? otherBank : value}
        options={[...bankOptions, { value: otherBank, label: "Other / enter manually / 其他银行" }]}
        onChange={(choice) => {
          setManual(choice === otherBank);
          onChange?.(choice === otherBank ? "" : choice);
        }}
      />
      {isManual && <Input id={id} aria-label="Bank name / 银行名称" placeholder="Enter bank name / 输入银行名称" value={value} onChange={event => onChange?.(event.target.value)} />}
    </Space>
  );
}
