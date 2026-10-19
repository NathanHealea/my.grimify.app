import { createContext, type ReactNode, useContext, useMemo } from "react";

const CHECK_TIMEOUT_MS = 30_000;

export type UpdateState = {
  /** A newer version is installed and waiting for the user to apply it. */
  ready: boolean;
  /** Activates the waiting version and reloads the app. */
  apply: () => void;
  /** Resolves true when a newer version is waiting afterwards; null until a service worker is registered. */
  check: (() => Promise<boolean>) | null;
};

const NO_UPDATES: UpdateState = { ready: false, apply: () => {}, check: null };

export const UpdateStateContext = createContext<UpdateState>(NO_UPDATES);

export function useUpdateState(): UpdateState {
  return useContext(UpdateStateContext);
}

/** Resolves true when a newer worker is waiting after asking the browser to re-fetch the service worker. */
export async function checkForUpdate(
  registration: ServiceWorkerRegistration | undefined,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<boolean> {
  if (!registration) throw new Error("The service worker isn't registered");
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`The update check didn't finish within ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([waitForUpdate(registration, abort.signal), deadline]);
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

async function waitForUpdate(
  registration: ServiceWorkerRegistration,
  signal: AbortSignal,
): Promise<boolean> {
  await registration.update();
  if (registration.waiting) return true;
  const { installing } = registration;
  if (!installing) return false;
  const worker: ServiceWorker = installing;

  // update() resolves once the new script is fetched, before it finishes installing.
  return new Promise<boolean>((resolve) => {
    worker.addEventListener(
      "statechange",
      () => {
        if (worker.state === "installed" || worker.state === "redundant") {
          resolve(worker.state === "installed");
        }
      },
      { signal },
    );
  });
}

type Props = {
  ready: boolean;
  apply: () => void;
  registration: ServiceWorkerRegistration | undefined;
  children: ReactNode;
};

export function UpdateStateProvider({ ready, apply, registration, children }: Props) {
  const value = useMemo<UpdateState>(
    () => ({ ready, apply, check: registration ? () => checkForUpdate(registration) : null }),
    [ready, apply, registration],
  );
  return <UpdateStateContext.Provider value={value}>{children}</UpdateStateContext.Provider>;
}
