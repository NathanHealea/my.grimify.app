import { type ReactNode, useCallback, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { UpdatePrompt } from "./update-prompt";
import { UpdateStateProvider } from "./update-state";

type Props = {
  children: ReactNode;
};

/** Registers the service worker, shares its update state and offers updates. Thin on purpose: the virtual module only exists in Vite builds. */
export function ServiceWorkerUpdates({ children }: Props) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swUrl: string, registered: ServiceWorkerRegistration | undefined) =>
      setRegistration(registered),
    onRegisterError: (error: unknown) => console.error("Service worker registration failed", error),
  });
  const apply = useCallback(() => void updateServiceWorker(), [updateServiceWorker]);

  return (
    <UpdateStateProvider ready={needRefresh} apply={apply} registration={registration}>
      {children}
      <UpdatePrompt needRefresh={needRefresh} onReload={apply} />
    </UpdateStateProvider>
  );
}
