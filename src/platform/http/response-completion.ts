import type { ServerResponse } from "node:http";

export interface ResponseCompletion {
  readonly aborted: boolean;
}

/**
 * Observes exactly one terminal response event.
 *
 * `writableEnded` only means that `end()` was called. A socket can still close
 * before the buffered response is flushed, in which case `writableFinished`
 * remains false and the request must be recorded as aborted.
 */
export function onResponseCompletion(
  response: ServerResponse,
  callback: (completion: ResponseCompletion) => void,
): void {
  let completed = false;

  const complete = (aborted: boolean): void => {
    if (completed) {
      return;
    }

    completed = true;
    callback({ aborted });
  };

  response.once("finish", () => complete(false));
  response.once("close", () => {
    if (!response.writableFinished) {
      complete(true);
    }
  });
}
