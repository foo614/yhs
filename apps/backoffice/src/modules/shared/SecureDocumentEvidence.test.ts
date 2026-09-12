import { describe, expect, it, vi } from "vitest";
import { documentPreviewKind } from "./DocumentPreviewDrawer";
import { releaseObjectUrl } from "./SecureDocumentEvidence";

describe("secure document evidence", () => {
  it.each([
    ["image/jpeg", "image"],
    ["image/png; charset=binary", "image"],
    ["image/webp", "image"],
    ["application/pdf", "pdf"],
    ["text/plain", "unsupported"]
  ] as const)("classifies %s as %s", (mimeType, expected) => {
    expect(documentPreviewKind(mimeType)).toBe(expected);
  });

  it("revokes loaded object URLs during replacement or unmount cleanup", () => {
    const revoke = vi.fn();
    releaseObjectUrl("blob:authenticated-evidence", revoke);
    releaseObjectUrl("", revoke);
    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:authenticated-evidence");
  });
});
