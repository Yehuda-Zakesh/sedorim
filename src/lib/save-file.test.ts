// Saving a generated file. On the desktop everything funnels through the
// `save_file_as` Rust command with base64 contents, so these tests stand in for
// the Rust side and check what actually goes over the wire.
import { describe, it, expect, beforeEach, vi } from "vitest";

const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>();

vi.mock("./tauri", () => ({
  get isDesktop() {
    return true;
  },
  invoke: (command: string, args?: Record<string, unknown>) => invoke(command, args),
}));

import { saveBase64File, saveBinaryFile, saveTextFile } from "./save-file";

/** The base64 the last call handed to Rust, decoded back to bytes. */
function sentBytes(): Uint8Array {
  const args = invoke.mock.calls.at(-1)![1] as { base64Contents: string };
  return new Uint8Array(Buffer.from(args.base64Contents, "base64"));
}
const sentName = () => (invoke.mock.calls.at(-1)![1] as { suggestedName: string }).suggestedName;

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(true);
});

describe("saveBase64File", () => {
  it("calls the save_file_as command", async () => {
    await saveBase64File("report.pdf", "AAAA");
    expect(invoke).toHaveBeenCalledWith("save_file_as", {
      suggestedName: "report.pdf",
      base64Contents: "AAAA",
    });
  });

  it("returns true when the file was written", async () => {
    invoke.mockResolvedValue(true);
    expect(await saveBase64File("a.pdf", "AAAA")).toBe(true);
  });

  it("returns false when the user cancels the dialog", async () => {
    invoke.mockResolvedValue(false);
    expect(await saveBase64File("a.pdf", "AAAA")).toBe(false);
  });

  it("lets a real failure reject", async () => {
    invoke.mockRejectedValue(new Error("could not save C:\\x"));
    await expect(saveBase64File("a.pdf", "AAAA")).rejects.toThrow(/could not save/);
  });

  it("passes the filename through untouched, Hebrew included", async () => {
    await saveBase64File("דוח חודשי.pdf", "AAAA");
    expect(sentName()).toBe("דוח חודשי.pdf");
  });
});

describe("saveBinaryFile", () => {
  it("base64-encodes the bytes", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    await saveBinaryFile("a.bin", bytes);
    expect(sentBytes()).toEqual(bytes);
  });

  it("matches Node's own base64 encoding", async () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]);
    await saveBinaryFile("a.bin", bytes);
    const args = invoke.mock.calls.at(-1)![1] as { base64Contents: string };
    expect(args.base64Contents).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("handles an empty file", async () => {
    await saveBinaryFile("empty.bin", new Uint8Array([]));
    expect(sentBytes()).toEqual(new Uint8Array([]));
  });

  it("covers every possible byte value", async () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    await saveBinaryFile("all.bin", bytes);
    expect(sentBytes()).toEqual(bytes);
  });

  it("survives a payload past the chunk size", async () => {
    // Encoding is chunked at 0x8000 because String.fromCharCode(...bytes) on a
    // multi-megabyte PDF blows the argument limit and throws.
    const bytes = new Uint8Array(0x8000 * 3 + 17);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    await saveBinaryFile("big.pdf", bytes);
    expect(sentBytes()).toEqual(bytes);
  });

  it("lands exactly on a chunk boundary without dropping or repeating bytes", async () => {
    for (const length of [0x8000 - 1, 0x8000, 0x8000 + 1]) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) bytes[i] = (i * 7) % 256;
      await saveBinaryFile("edge.bin", bytes);
      expect(sentBytes(), String(length)).toEqual(bytes);
    }
  });

  it("encodes a view into a larger buffer, not the whole buffer", async () => {
    const backing = new Uint8Array([9, 9, 1, 2, 3, 9, 9]);
    const view = backing.subarray(2, 5);
    await saveBinaryFile("view.bin", view);
    expect(sentBytes()).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("passes the cancel result through", async () => {
    invoke.mockResolvedValue(false);
    expect(await saveBinaryFile("a.bin", new Uint8Array([1]))).toBe(false);
  });
});

describe("saveTextFile", () => {
  it("writes text as UTF-8", async () => {
    await saveTextFile("a.txt", "Hello");
    expect(Buffer.from(sentBytes()).toString("utf8")).toBe("Hello");
  });

  it("keeps Hebrew intact through the round trip", async () => {
    const text = 'סדר פלוס — גיבוי "מלא"';
    await saveTextFile("backup.json", text);
    expect(Buffer.from(sentBytes()).toString("utf8")).toBe(text);
  });

  it("uses multi-byte UTF-8 rather than one byte per character", async () => {
    await saveTextFile("a.txt", "שלום");
    // Four Hebrew letters, two bytes each.
    expect(sentBytes()).toHaveLength(8);
  });

  it("handles an empty string", async () => {
    await saveTextFile("a.txt", "");
    expect(sentBytes()).toEqual(new Uint8Array([]));
  });

  it("handles a large JSON backup", async () => {
    const text = JSON.stringify({
      attendance: Array.from({ length: 5000 }, (_, i) => ({ id: `s${i}`, note: "הערה" })),
    });
    await saveTextFile("backup.json", text);
    expect(Buffer.from(sentBytes()).toString("utf8")).toBe(text);
  });

  it("preserves characters outside the BMP", async () => {
    await saveTextFile("a.txt", "✓ 𝕊");
    expect(Buffer.from(sentBytes()).toString("utf8")).toBe("✓ 𝕊");
  });
});
