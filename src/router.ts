import { createRouter, type RouterHistory } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }

  interface StaticDataRouteOption {
    title?: string;
    /** Shows a back button in the header instead of relying on the browser's (absent in iOS standalone). */
    back?: { to: "/paints" | "/palettes"; label: string };
  }
}
