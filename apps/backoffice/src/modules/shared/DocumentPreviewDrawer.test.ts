import { describe, expect, it } from "vitest";
import { documentPreviewKind } from "./DocumentPreviewDrawer";

describe("document preview type allowlist", () => {
  it("previews only supported image and PDF MIME types", () => {
    expect(documentPreviewKind("application/pdf")).toBe("pdf");
    expect(documentPreviewKind("image/jpeg")).toBe("image");
    expect(documentPreviewKind("image/png; charset=binary")).toBe("image");
    expect(documentPreviewKind("image/webp")).toBe("image");
  });

  it("does not render active or unknown content inline", () => {
    expect(documentPreviewKind("image/svg+xml")).toBe("unsupported");
    expect(documentPreviewKind("text/html")).toBe("unsupported");
    expect(documentPreviewKind("application/octet-stream")).toBe("unsupported");
  });
});
