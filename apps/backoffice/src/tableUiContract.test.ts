import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL(".", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

describe("operational table UI contract", () => {
  it("uses ProTable rather than importing the plain Ant Design Table component", () => {
    const offenders = sourceFiles(sourceRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const imports = Array.from(source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']antd["']/gs));
      const importsPlainTable = imports.some((match) => match[1]
        .split(",")
        .map((name) => name.trim())
        .some((name) => /^Table(?:\s+as\s+\w+)?$/.test(name)));

      return importsPlainTable ? [path.slice(sourceRoot.length)] : [];
    });

    expect(offenders).toEqual([]);
  });

  it("filters searchable value-label selects by their visible label", () => {
    const offenders = sourceFiles(sourceRoot).flatMap((path) => {
      if (!path.endsWith(".tsx") || path.endsWith(".test.tsx")) return [];
      const source = readFileSync(path, "utf8");
      const selectTags = source.match(/<Select\b[\s\S]*?\/>/g) ?? [];
      return selectTags
        .filter((tag) => /\bshowSearch\b/.test(tag) && /\boptions=/.test(tag) && !/optionFilterProp=["']label["']/.test(tag))
        .map(() => path.slice(sourceRoot.length));
    });

    expect(offenders).toEqual([]);
  });

  it("keeps staff filter bars visible at every responsive width", () => {
    const styles = readFileSync(join(sourceRoot, "styles.css"), "utf8");

    for (const selector of ["workflowFilterBar", "vehicleOperationFilters", "staffFilterBar", "toolbarForm"]) {
      expect(styles, `${selector} must not be globally hidden`).not.toMatch(
        new RegExp(`\\.${selector}[^{}]*\\{[^}]*display\\s*:\\s*none\\s*!important`, "s")
      );
    }
  });
});
