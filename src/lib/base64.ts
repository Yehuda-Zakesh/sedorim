// Base64 in both directions, in one place.
//
// Every file the app produces travels to Rust base64-encoded (see
// save-file.ts), and the PDF exporter has to hand jsPDF a base64 copy of the
// Hebrew font as well — so this stopped being a private helper of one module.

/** Chunked on purpose: `String.fromCharCode(...bytes)` on a multi-megabyte
 *  buffer exceeds the argument limit and throws. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
