# map-scissor-swipe

A high-performance, zero-dependency swipe comparison control for **MapLibre GL JS** (≥ 3.0.0) and **Mapbox GL JS** (≥ 2.0.0).

Unlike traditional two-map syncing libraries, `map-scissor-swipe` operates completely within a **single map instance** via hardware-accelerated WebGL scissor testing. This cuts memory overhead roughly in half, removes camera tracking lag, and guarantees pixel-perfect frame synchronization.

## Features

- ⚡ **Zero Dependencies** — Pure vanilla TypeScript targeting native WebGL contexts.
- 📦 **Dual Build Distribution** — Native Support for modern ESM (`import`) and standard CJS (`require`).
- 🎨 **Deep Customization** — Total visual design styling control via runtime JavaScript arguments or plain CSS class hooks.
- ↔️ **Bi-directional Controls** — Supports toggling seamlessly between vertical split or horizontal configurations.

## Installation

```bash
npm install map-scissor-swipe
```

## Usage

```typescript
import { MapScissorSwipe } from "map-scissor-swipe";

map.on("load", () => {
  // Add your layers normally...
  map.addLayer({
    id: "historical-imagery",
    type: "raster",
    source: "old-tiles",
  });
  map.addLayer({ id: "modern-satellite", type: "raster", source: "new-tiles" });

  // Initialize the slider swipe instance
  const swipe = new MapScissorSwipe(map, {
    leftLayers: ["historical-imagery"],
    rightLayers: ["modern-satellite"],
    position: 0.5,
    swipeBar: {
      width: 4,
      color: "#ffffff",
      borderColor: "#000000",
    },
  });
});
```

## License

MIT
