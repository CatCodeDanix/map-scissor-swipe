[![npm version](https://img.shields.io/npm/v/map-scissor-swipe.svg?style=flat-square)](https://www.npmjs.com/package/map-scissor-swipe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

# map-scissor-swipe

A high-performance, zero-dependency swipe comparison control for **MapLibre GL JS** (≥ 3.0.0) and **Mapbox GL JS** (≥ 2.0.0).

Unlike traditional two-map syncing libraries, `map-scissor-swipe` operates completely within a **single map instance** via hardware-accelerated WebGL scissor testing. This cuts memory overhead roughly in half, removes camera tracking lag, and guarantees pixel-perfect frame synchronization.

## 🌐 Live Demos

See the hardware-accelerated slider control in action across different mapping ecosystems:

- 🗺️ [MapLibre GL JS Live Example](https://CatCodeDanix.github.io/map-scissor-swipe/demo/maplibre.html)
- 🛰️ [Mapbox GL JS Live Example](https://CatCodeDanix.github.io/map-scissor-swipe/demo/mapbox.html)

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
