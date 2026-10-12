import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/palettes/")({
  staticData: { title: "Palettes" },
  component: () => null,
});
