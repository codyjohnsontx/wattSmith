// Browser only: saves an encoded ride as a .fit file. Pass encodeRideFit's
// bytes and rideFitFileName's name.
export function downloadFitFile(bytes: Uint8Array<ArrayBuffer>, fileName: string, doc: Document = document) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.ant.fit" }));
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
