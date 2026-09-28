export const REVOKE_DELAY_MS = 10_000;

// Browser only: saves an encoded ride as a .fit file. Pass encodeRideFit's
// bytes and rideFitFileName's name.
export function downloadFitFile(bytes: Uint8Array<ArrayBuffer>, fileName: string, doc: Document = document) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.ant.fit" }));
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // Browsers may read the URL after click returns; revoking at once can
  // cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
