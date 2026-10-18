/**
 * The script editor's typing in flight (M3.2): texts typed and sent as edits, oldest first, until
 * those edits land. A file that reads as one of them is the editor's own typing arriving; one that
 * reads otherwise while typing is in flight is older than it, and about to be overtaken; once none
 * is in flight, the file is what to show: an undo, a redo, another tab's save.
 */
export interface TypedAhead {
  /** Typed text sent as an edit; call what it returns once that edit has been made. */
  send(text: string): () => void;
  /** What the file's text means now. */
  read(text: string): 'ours' | 'wait' | 'show';
}

export function typedAhead(): TypedAhead {
  const sent: { readonly text: string }[] = [];
  return {
    send(text) {
      const entry = { text };
      sent.push(entry);
      // An edit that changed nothing is never read back, so it leaves once made.
      return () => {
        const i = sent.indexOf(entry);
        if (i >= 0) sent.splice(i, 1);
      };
    },
    read(text) {
      const i = sent.findIndex((entry) => entry.text === text);
      if (i >= 0) {
        // The edits land in order: this one, and any sent before it, are in the file.
        sent.splice(0, i + 1);
        return 'ours';
      }
      return sent.length > 0 ? 'wait' : 'show';
    },
  };
}
