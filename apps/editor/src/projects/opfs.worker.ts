/** The OPFS writer's thread (opfsWrite.ts): requests are written one at a time, in the order they came. */
import type { DirectoryLike } from './files.ts';
import { type WriteReply, type WriteRequest, writeFiles } from './opfsWrite.ts';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WriteRequest>) => void) | null;
  postMessage(reply: WriteReply): void;
};

let queue: Promise<void> = Promise.resolve();

scope.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const root = (await navigator.storage.getDirectory()) as unknown as DirectoryLike;
      await writeFiles(root, data.base, data.files);
      scope.postMessage({ id: data.id, ok: true });
    } catch (error) {
      scope.postMessage({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
