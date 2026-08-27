import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/User/Downloads/autocount field.xlsx";
const outputDir = "C:/Users/User/Documents/YHS/.codex-tmp/autocount-review";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,definedName",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 30,
  tableMaxCellChars: 120,
});
console.log(summary.ndjson);

const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
console.log(sheets.ndjson);

for (const item of workbook.worksheets.items) {
  const used = item.getUsedRange();
  if (!used) continue;
  const preview = await workbook.render({ sheetName: item.name, autoCrop: "all", scale: 1.2, format: "png" });
  await fs.writeFile(`${outputDir}/${item.name.replace(/[^a-z0-9_-]/gi, "_")}.png`, new Uint8Array(await preview.arrayBuffer()));
  const region = await workbook.inspect({
    kind: "region",
    sheetId: item.name,
    range: used.address,
    maxChars: 20000,
    tableMaxRows: 30,
    tableMaxCols: 60,
    tableMaxCellChars: 160,
  });
  console.log(region.ndjson);
}
