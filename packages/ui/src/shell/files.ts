/**
 * Saves out of the page and into it (M4.3): a file the browser downloads, text on the clipboard,
 * and a file the player picks. Each made only when asked, so no input or link sits in the page.
 */

export function saveText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Whether the text went onto the clipboard; where it is refused, the shell shows the text to copy. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function pickText(then: (text: string, name: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json,text/plain';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void file.text().then((text) => then(text, file.name));
  });
  input.click();
}
