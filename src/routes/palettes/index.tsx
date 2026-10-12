import { createFileRoute } from "@tanstack/react-router";

import { PalettesScreen } from "@/features/palettes/palettes-screen";

export const Route = createFileRoute("/palettes/")({
  staticData: { title: "Palettes" },
  component: PalettesScreen,
});
