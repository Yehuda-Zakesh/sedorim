import { invoke, isDesktop } from "./tauri";

// Saving a generated file (PDF, Excel, JSON backup) to disk.
//
// A WebView has no working `<a download>` — which is exactly what jsPDF's
// save() and SheetJS's writeFile() reach for internally — so on the desktop
// every save goes through the `save_file_as` command instead: it shows the
// native "save as" dialog and writes the bytes from Rust.
//
// Contents travel base64-encoded because jsPDF and SheetJS can both emit
// base64 directly, and because a JSON array of byte values would be roughly
// four times the size on the wire.

/** Resolves false when the user cancels the save dialog. */
export async function saveBase64File(filename: string, base64: string): Promise<boolean> {
  if (!isDesktop) return devDownload(filename, base64ToBytes(base64));
  return invoke<boolean>("save_file_as", {
    suggestedName: filename,
    base64Contents: base64,
  });
}

export function saveBinaryFile(filename: string, bytes: Uint8Array): Promise<boolean> {
  return saveBase64File(filename, bytesToBase64(bytes));
}

/** Text is written as UTF-8, so Hebrew survives the round trip. */
export function saveTextFile(filename: string, text: string): Promise<boolean> {
  return saveBinaryFile(filename, new TextEncoder().encode(text));
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked: String.fromCharCode(...bytes) on a multi-megabyte PDF blows the
  // argument limit and throws.
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** `npm run dev` only — a normal browser download. */
function devDownload(filename: string, bytes: Uint8Array): boolean {
  // Copy into a standalone buffer so the Blob gets a plain ArrayBuffer
  // regardless of whether `bytes` was a view into a larger one.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  const url = URL.createObjectURL(new Blob([buffer], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
