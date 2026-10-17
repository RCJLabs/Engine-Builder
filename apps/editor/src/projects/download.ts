/** Hands the user a file to keep, as a download. Phones put it in Downloads or, on iOS, Files. */
export function saveFile(bytes: Uint8Array, name: string, type = 'application/zip'): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked later, not now: some browsers start reading the URL only after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
