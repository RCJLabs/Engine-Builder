/** The OPFS writer's thread (opfsWrite.ts, journal.ts): requests run one at a time, in the order they came. */
import { recoverJournal, saveFiles } from '../editing/journal.ts';
import type { DirectoryLike } from './files.ts';
import type { WorkerReply, WorkerRequest } from './opfsProtocol.ts';
import { writeFiles } from './opfsWrite.ts';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(reply: WorkerReply): void;
};

async function run(root: DirectoryLike, request: WorkerRequest): Promise<number> {
  if (request.kind === 'write') await writeFiles(root, request.base, request.files);
  else if (request.kind === 'save') await saveFiles(root, request.base, request.files);
  else return recoverJournal(root, request.base);
  return 0;
}

let queue: Promise<void> = Promise.resolve();

scope.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const root = (await navigator.storage.getDirectory()) as unknown as DirectoryLike;
      scope.postMessage({ id: data.id, ok: true, recovered: await run(root, data) });
    } catch (error) {
      scope.postMessage({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
