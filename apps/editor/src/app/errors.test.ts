import { beforeEach, expect, it } from 'vitest';
import { catchErrors } from './errors.ts';
import { lastError, log } from './state.ts';

/** A window to dispatch to: the events catchErrors listens for, as the browser fires them. */
function page(): EventTarget {
  const target = new EventTarget();
  catchErrors(target as unknown as Window);
  return target;
}
const error = (message: string, cause?: unknown) => Object.assign(new Event('error'), { message, error: cause });
const rejection = (reason: unknown) => Object.assign(new Event('unhandledrejection'), { reason });
const said = () => log.value.map((line) => `${line.level} ${line.text}`);

beforeEach(() => {
  log.value = [];
  lastError.value = null;
});

it('says errors nothing caught, and refused promises, in the console as errors', () => {
  const target = page();
  target.dispatchEvent(error('Uncaught TypeError: x is not a function'));
  target.dispatchEvent(error('', new Error('said by the error alone')));
  target.dispatchEvent(rejection(new Error('a promise refused')));
  target.dispatchEvent(rejection('a reason that is no Error'));
  expect(said()).toEqual([
    'error Something went wrong in the editor: Uncaught TypeError: x is not a function',
    'error Something went wrong in the editor: said by the error alone',
    'error Something went wrong in the editor: a promise refused',
    'error Something went wrong in the editor: a reason that is no Error',
  ]);
  expect(lastError.value?.text).toBe('Something went wrong in the editor: a reason that is no Error');
});

it('leaves out the ResizeObserver loop Chrome reports, as nothing went wrong', () => {
  page().dispatchEvent(error('ResizeObserver loop completed with undelivered notifications.'));
  expect(said()).toEqual([]);
});
