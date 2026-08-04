export async function decodeBase64Image(imageBase64: string) {
  return Buffer.from(imageBase64, "base64");
}

export async function resizeForAnalysis(input: Buffer) {
  return input;
}

export function toUint8Array(buffer: Buffer) {
  return new Uint8Array(buffer);
}
