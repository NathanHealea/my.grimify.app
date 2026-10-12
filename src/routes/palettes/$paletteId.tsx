import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/palettes/$paletteId")({
  staticData: { back: { to: "/palettes", label: "Palettes" } },
  component: () => null,
});
