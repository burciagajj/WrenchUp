/**
 * Decode a base64 string to bytes.
 *
 * Deliberately NOT `Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))` —
 * that invokes a callback per character, which for a multi-MB camera photo
 * (several million characters once base64-inflated) is slow enough to blow
 * through a serverless function's CPU-time budget before the upload fetch
 * ever fires. A plain indexed loop into a preallocated array avoids the
 * per-element callback overhead.
 */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
