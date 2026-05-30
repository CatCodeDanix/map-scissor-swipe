/*!
 * map-scissor-swipe
 *
 * A zero-dependency swipe comparison control for MapLibre GL JS and Mapbox GL JS.
 * Unlike two-map solutions, this operates on a single map instance, using WebGL
 * scissor testing to clip named layer groups — eliminating camera-sync drift,
 * halving memory usage, and guaranteeing pixel-perfect alignment.
 *
 * @module map-scissor-swipe
 */

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Direction the divider bar runs across the map.
 * - `'vertical'`   — bar is a vertical line; left / right halves
 * - `'horizontal'` — bar is a horizontal line; top / bottom halves
 */
export type Orientation = "vertical" | "horizontal";

/**
 * Appearance and content of the draggable swipe bar.
 *
 * **Full CSS control**: set `className` and omit `color` / `borderColor` —
 * those inline defaults are skipped when a class name is present, so your
 * stylesheet has undiluted specificity. Structural styles (position, size,
 * cursor, z-index) are always applied inline so the bar is usable out of
 * the box.
 */
export interface SwipeBarOptions {
  /**
   * Thickness of the bar in CSS pixels.
   * This is the *width* for a vertical bar and the *height* for horizontal.
   * Default: `4`
   */
  width?: number;

  /**
   * CSS background color. Ignored when `className` is set.
   * Default: `'#ffffff'`
   */
  color?: string;

  /**
   * CSS border color on the two long edges of the bar.
   * Ignored when `className` is set.
   * Default: `'#000000'`
   */
  borderColor?: string;

  /**
   * Width of each border in CSS pixels. Ignored when `className` is set.
   * Default: `1`
   */
  borderWidth?: number;

  /**
   * One or more CSS class names added to the bar `<div>`. When provided,
   * `color`, `borderColor`, and `borderWidth` are **not** applied as inline
   * styles — your CSS takes full control of visual appearance.
   */
  className?: string;

  /**
   * Content to display as a centred handle / icon on the bar.
   * Pass an **HTML string** (e.g. an inline SVG) or an **HTMLElement**.
   * Pass `null` explicitly (or omit) for no handle.
   * Default: `null`
   */
  handle?: string | HTMLElement | null;

  /**
   * Inline CSS properties merged onto the handle wrapper `<div>`.
   * Useful for padding, border-radius, box-shadow, background, etc.
   */
  handleStyle?: Partial<CSSStyleDeclaration>;
}

/** Options passed to the {@link MapScissorSwipe} constructor. */
export interface MapScissorSwipeOptions {
  /**
   * IDs of already-added map layers to show on the **left** side
   * (or **top** when `orientation` is `'horizontal'`).
   * The first ID in the array is used as the render-order anchor;
   * scissor activation is inserted immediately before it.
   * At least one ID is required.
   */
  leftLayers: string[];

  /**
   * IDs of already-added map layers to show on the **right** side
   * (or **bottom** when `orientation` is `'horizontal'`).
   * Same anchor semantics as `leftLayers`.
   * At least one ID is required.
   */
  rightLayers: string[];

  /**
   * Initial swipe position as a ratio in **[0, 1]**.
   * `0` = fully left/top, `1` = fully right/bottom.
   * Default: `0.5`
   */
  position?: number;

  /**
   * Bar orientation.
   * Default: `'vertical'`
   */
  orientation?: Orientation;

  /** Appearance of the draggable divider bar. */
  swipeBar?: SwipeBarOptions;
}

/**
 * Subset of `MapScissorSwipeOptions` accepted by {@link MapScissorSwipe.update}.
 * `leftLayers` and `rightLayers` are excluded — changing them requires
 * `destroy()` + a new instance.
 */
export type MapScissorSwipeUpdateOptions = Partial<
  Omit<MapScissorSwipeOptions, "leftLayers" | "rightLayers">
>;

/**
 * Minimal structural interface shared by MapLibre GL JS ≥ 3 and Mapbox GL JS ≥ 2.
 * The library accepts any object that satisfies this shape, so you can pass
 * either library's `Map` instance without extra casting.
 */
export interface MapLike {
  getCanvas(): HTMLCanvasElement;
  getContainer(): HTMLElement;
  /** Insert a layer into the render stack, optionally before `beforeId`. */
  addLayer(layer: Record<string, unknown>, beforeId?: string): void;
  removeLayer(id: string): void;
  on(type: string, listener: (...args: unknown[]) => void): void;
  off(type: string, listener: (...args: unknown[]) => void): void;
  /** MapLibre GL JS: synchronous redraw. */
  redraw?(): void;
  /** MapLibre GL JS / Mapbox GL JS: schedule an async repaint. */
  triggerRepaint?(): void;
}

// ─── Internal resolved types ──────────────────────────────────────────────────

interface ResolvedBar {
  width: number;
  color: string;
  borderColor: string;
  borderWidth: number;
  className: string;
  handle: string | HTMLElement | null;
  handleStyle: Partial<CSSStyleDeclaration>;
}

interface ResolvedOpts {
  leftLayers: string[];
  rightLayers: string[];
  position: number;
  orientation: Orientation;
  swipeBar: ResolvedBar;
}

function resolveOpts(raw: MapScissorSwipeOptions): ResolvedOpts {
  return {
    leftLayers: raw.leftLayers,
    rightLayers: raw.rightLayers,
    position: clamp01(raw.position ?? 0.5),
    orientation: raw.orientation ?? "vertical",
    swipeBar: {
      width: raw.swipeBar?.width ?? 4,
      color: raw.swipeBar?.color ?? "#ffffff",
      borderColor: raw.swipeBar?.borderColor ?? "#000000",
      borderWidth: raw.swipeBar?.borderWidth ?? 1,
      className: raw.swipeBar?.className ?? "",
      handle: raw.swipeBar?.handle ?? null,
      handleStyle: raw.swipeBar?.handleStyle ?? {},
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ─── Main class ───────────────────────────────────────────────────────────────

/**
 * Swipe comparison control for a single MapLibre / Mapbox map instance.
 *
 * **How it works**
 *
 * Three invisible WebGL "marker" layers are inserted into the map's render
 * stack around your content layers:
 *
 * ```
 * [_mss_l_<uid>]  ← enables GL scissor for the left/top region
 * ...leftLayers...
 * [_mss_r_<uid>]  ← reconfigures scissor for the right/bottom region
 * ...rightLayers...
 * [_mss_d_<uid>]  ← disables GL scissor (normal rendering resumes)
 * ```
 *
 * On every frame the scissor box is recalculated from the current ratio, so
 * the map only needs one repaint — no second map instance, no sync loop.
 *
 * @example
 * ```ts
 * map.on('load', () => {
 *   // Add your sources and layers first…
 *   map.addSource('osm', { type: 'raster', tiles: ['https://…'] });
 *   map.addLayer({ id: 'osm-layer', type: 'raster', source: 'osm' });
 *
 *   map.addSource('sat', { type: 'raster', tiles: ['https://…'] });
 *   map.addLayer({ id: 'sat-layer', type: 'raster', source: 'sat' });
 *
 *   // Then create the swipe control.
 *   const swipe = new MapScissorSwipe(map, {
 *     leftLayers:  ['osm-layer'],
 *     rightLayers: ['sat-layer'],
 *     position: 0.5,
 *     swipeBar: {
 *       handle: '<svg>…</svg>',
 *       color: '#fff',
 *     },
 *   });
 * });
 * ```
 */
export class MapScissorSwipe {
  private readonly map: MapLike;
  private opts: ResolvedOpts;
  /** Current position as a 0–1 ratio. Use {@link setPosition} to change it. */
  private ratio: number;
  private bar!: HTMLDivElement;
  private dragging = false;
  private destroyed = false;
  private readonly uid: string;

  // Bound listeners stored so they can be removed in destroy()
  private readonly _onBarDown: (e: MouseEvent | TouchEvent) => void;
  private readonly _onDocMove: (e: MouseEvent | TouchEvent) => void;
  private readonly _onDocUp: () => void;
  private readonly _onMapResize: () => void;

  /**
   * Create a new swipe control and attach it to `map`.
   *
   * The referenced layer IDs **must already exist** in the map when the
   * constructor is called. Typical usage is inside a `map.on('load', …)`
   * callback after all sources and layers have been added.
   *
   * @throws {Error} If `leftLayers` or `rightLayers` is empty.
   */
  constructor(map: MapLike, options: MapScissorSwipeOptions) {
    if (!options.leftLayers?.length) {
      throw new Error(
        "[map-scissor-swipe] options.leftLayers must contain at least one layer ID.",
      );
    }
    if (!options.rightLayers?.length) {
      throw new Error(
        "[map-scissor-swipe] options.rightLayers must contain at least one layer ID.",
      );
    }

    this.map = map;
    this.uid = Math.random().toString(36).slice(2, 9);
    this.opts = resolveOpts(options);
    this.ratio = this.opts.position;

    this._onBarDown = this._handleBarDown.bind(this);
    this._onDocMove = this._handleDocMove.bind(this);
    this._onDocUp = this._handleDocUp.bind(this);
    this._onMapResize = this._updateBarPosition.bind(this);

    this._insertScissorLayers();
    this._createBar();
    this._attachEvents();
    this._updateBarPosition();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Programmatically move the swipe divider.
   * @param ratio A value in **[0, 1]**; clamped automatically.
   * @returns `this` for chaining.
   */
  setPosition(ratio: number): this {
    this._assertAlive();
    this.ratio = clamp01(ratio);
    this._updateBarPosition();
    this._repaint();
    return this;
  }

  /**
   * Returns the current divider position as a ratio in **[0, 1]**.
   */
  getPosition(): number {
    return this.ratio;
  }

  /**
   * Update visual options without recreating the control.
   *
   * Accepts any subset of `position`, `orientation`, and `swipeBar` (with deep
   * merge for `swipeBar` sub-fields). `leftLayers` / `rightLayers` cannot be
   * changed — call {@link destroy} and create a new instance instead.
   *
   * @returns `this` for chaining.
   *
   * @example
   * ```ts
   * swipe.update({
   *   orientation: 'horizontal',
   *   swipeBar: { color: '#ff0000', width: 8 },
   * });
   * ```
   */
  update(patch: MapScissorSwipeUpdateOptions): this {
    this._assertAlive();

    if (patch.position !== undefined) {
      this.ratio = clamp01(patch.position);
    }

    // Deep-merge swipeBar so callers can update individual sub-fields
    const mergedBar: SwipeBarOptions = patch.swipeBar
      ? { ...this.opts.swipeBar, ...patch.swipeBar }
      : this.opts.swipeBar;

    this.opts = resolveOpts({
      leftLayers: this.opts.leftLayers,
      rightLayers: this.opts.rightLayers,
      position: this.ratio,
      orientation: patch.orientation ?? this.opts.orientation,
      swipeBar: mergedBar,
    });

    this._rebuildBar();
    this._updateBarPosition();
    this._repaint();
    return this;
  }

  /**
   * Remove the swipe control entirely.
   *
   * - Detaches all DOM and map event listeners.
   * - Removes the bar element from the container.
   * - Removes the three internal scissor GL layers from the map.
   * - Triggers a final repaint so the layers render without clipping.
   *
   * Calling any method after `destroy()` throws an error.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // DOM events
    this.bar.removeEventListener("mousedown", this._onBarDown);
    this.bar.removeEventListener("touchstart", this._onBarDown);
    document.removeEventListener("mousemove", this._onDocMove as EventListener);
    document.removeEventListener("mouseup", this._onDocUp);
    document.removeEventListener("touchmove", this._onDocMove as EventListener);
    document.removeEventListener("touchend", this._onDocUp);

    // Map event
    this.map.off("resize", this._onMapResize);

    // DOM element
    this.bar.parentNode?.removeChild(this.bar);

    // GL layers — wrapped individually; a missing layer shouldn't abort cleanup
    for (const s of ["l", "r", "d"] as const) {
      try {
        this.map.removeLayer(this._lid(s));
      } catch {
        // layer already gone or map already destroyed — safe to ignore
      }
    }

    // One clean repaint so content layers render without scissor clipping
    this._repaint();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Namespaced layer ID. */
  private _lid(suffix: string): string {
    return `_mss_${suffix}_${this.uid}`;
  }

  private _assertAlive(): void {
    if (this.destroyed) {
      throw new Error(
        "[map-scissor-swipe] Cannot call methods on a destroyed instance.",
      );
    }
  }

  /**
   * Insert the three scissor-marker GL custom layers into the map's render
   * stack in the correct positions relative to the user's layers.
   *
   * Layer order produced:
   * ```
   * … existing layers …
   * _mss_l_<uid>       (before leftLayers[0])
   * leftLayers…
   * _mss_r_<uid>       (before rightLayers[0])
   * rightLayers…
   * _mss_d_<uid>       (last — re-enables scissor-free rendering for anything above)
   * ```
   */
  private _insertScissorLayers(): void {
    const self = this;

    /**
     * Left / top scissor layer.
     * Enables the scissor test and restricts rendering to the left (vertical)
     * or top (horizontal) region for every layer that follows until the right
     * scissor layer fires.
     */
    const leftLayer: Record<string, unknown> = {
      id: this._lid("l"),
      type: "custom",
      renderingMode: "2d",
      onAdd() {
        /* no setup needed */
      },
      render(gl: WebGLRenderingContext) {
        const c = self.map.getCanvas();
        gl.enable(gl.SCISSOR_TEST);

        if (self.opts.orientation === "vertical") {
          // Clip to [0 … swipeX] columns
          const x = Math.round(c.width * self.ratio);
          gl.scissor(0, 0, x, c.height);
        } else {
          // Clip to the top portion of the screen.
          // gl.scissor uses a bottom-left origin (WebGL convention), so the
          // "top" in screen-space maps to high y-values in GL-space.
          //   swipeY_screen = ratio × height  (pixels from top of canvas)
          //   swipeY_gl     = height − swipeY_screen  (pixels from bottom)
          // We scissor the band from swipeY_gl to the top of the canvas.
          const swipeY = Math.round(c.height * self.ratio);
          const glY = c.height - swipeY;
          gl.scissor(0, glY, c.width, swipeY);
        }
      },
    };

    /**
     * Right / bottom scissor layer.
     * Reconfigures the scissor box for the complementary region.
     */
    const rightLayer: Record<string, unknown> = {
      id: this._lid("r"),
      type: "custom",
      renderingMode: "2d",
      onAdd() {},
      render(gl: WebGLRenderingContext) {
        const c = self.map.getCanvas();
        gl.enable(gl.SCISSOR_TEST);

        if (self.opts.orientation === "vertical") {
          const x = Math.round(c.width * self.ratio);
          gl.scissor(x, 0, c.width - x, c.height);
        } else {
          // Clip to the bottom portion of the screen.
          // The bottom in screen-space = low y-values in GL-space.
          const swipeY = Math.round(c.height * self.ratio);
          const glY = c.height - swipeY;
          gl.scissor(0, 0, c.width, glY);
        }
      },
    };

    /**
     * Disable-scissor layer.
     * Must come after all right-side layers so any additional layers added by
     * the user on top render without clipping.
     */
    const disableLayer: Record<string, unknown> = {
      id: this._lid("d"),
      type: "custom",
      renderingMode: "2d",
      onAdd() {},
      render(gl: WebGLRenderingContext) {
        gl.disable(gl.SCISSOR_TEST);
      },
    };

    this.map.addLayer(leftLayer, this.opts.leftLayers[0]);
    this.map.addLayer(rightLayer, this.opts.rightLayers[0]);
    // No beforeId → placed on top of all existing layers, which is correct:
    // scissor is disabled after all right-side content, and any future layers
    // the user adds above will also render without clipping.
    this.map.addLayer(disableLayer);
  }

  /** Create the DOM bar element and append it to the map container. */
  private _createBar(): void {
    this.bar = document.createElement("div");
    this._rebuildBar();
    this.map.getContainer().appendChild(this.bar);
  }

  /**
   * Reapply all styles and content to the bar element.
   * Called on construction and after every `update()`.
   */
  private _rebuildBar(): void {
    const { swipeBar, orientation } = this.opts;
    const isVert = orientation === "vertical";
    const el = this.bar;
    const hasClass = swipeBar.className.length > 0;

    // ── Reset ──────────────────────────────────────────────────────────────
    el.removeAttribute("style");
    el.className = swipeBar.className;
    while (el.firstChild) el.removeChild(el.firstChild);

    // ── Structural inline styles (always applied) ─────────────────────────
    // These ensure the bar is positioned and usable regardless of CSS setup.
    el.style.position = "absolute";
    el.style.zIndex = "1000";
    el.style.cursor = isVert ? "ew-resize" : "ns-resize";
    el.style.userSelect = "none";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el.style as any).webkitUserSelect = "none";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.touchAction = "none";

    // Dimension / span
    if (isVert) {
      el.style.top = "0";
      el.style.bottom = "0";
      el.style.width = `${swipeBar.width}px`;
      el.style.height = "100%";
    } else {
      el.style.left = "0";
      el.style.right = "0";
      el.style.height = `${swipeBar.width}px`;
      el.style.width = "100%";
    }

    // ── Visual inline styles (skipped when className is provided) ──────────
    // When the user supplies a className they take full responsibility for the
    // visual appearance; applying inline defaults here would force them to use
    // `!important` everywhere.
    if (!hasClass) {
      el.style.backgroundColor = swipeBar.color;
      const border = `${swipeBar.borderWidth}px solid ${swipeBar.borderColor}`;
      if (isVert) {
        el.style.borderLeft = border;
        el.style.borderRight = border;
      } else {
        el.style.borderTop = border;
        el.style.borderBottom = border;
      }
    }

    // ── Handle ─────────────────────────────────────────────────────────────
    if (swipeBar.handle !== null) {
      const wrap = document.createElement("div");
      // Base wrapper styles — the user overrides via handleStyle
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.justifyContent = "center";
      // wrap.style.pointerEvents = "none";
      // wrap.style.flexShrink = "0";
      wrap.style.pointerEvents = "auto"; // Changed from "none"
      wrap.style.flexShrink = "0";
      (wrap.style as any).webkitTouchCallout = "none";
      (wrap.style as any).webkitUserSelect = "none";
      wrap.style.userSelect = "none";

      if (!isVert) {
        wrap.style.transform = "rotateZ(90deg)";
      }

      // Merge any custom handleStyle overrides
      const hs = swipeBar.handleStyle;
      for (const prop of Object.keys(hs) as Array<keyof CSSStyleDeclaration>) {
        if (typeof hs[prop] === "string") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (wrap.style as any)[prop] = hs[prop];
        }
      }

      if (typeof swipeBar.handle === "string") {
        wrap.innerHTML = swipeBar.handle;
      } else {
        // Clone so the user's original element isn't consumed
        wrap.appendChild(swipeBar.handle.cloneNode(true) as HTMLElement);
      }

      el.appendChild(wrap);
    }
  }

  /**
   * Reposition the DOM bar to match `this.ratio`.
   * Uses the container's CSS pixel dimensions so DPR is handled correctly
   * (as opposed to `canvas.width` which is in physical pixels).
   */
  private _updateBarPosition(): void {
    const ctr = this.map.getContainer();
    if (this.opts.orientation === "vertical") {
      this.bar.style.left = `${this.ratio * ctr.clientWidth}px`;
      // Clear the complementary axis in case orientation was changed
      this.bar.style.top = "";
    } else {
      this.bar.style.top = `${this.ratio * ctr.clientHeight}px`;
      this.bar.style.left = "";
    }
  }

  /**
   * Ask the map to re-render.
   * Supports both the MapLibre (`redraw`) and the Mapbox / newer MapLibre
   * (`triggerRepaint`) APIs, preferring the async variant to avoid recursion.
   */
  private _repaint(): void {
    if (this.map.triggerRepaint) {
      this.map.triggerRepaint();
    } else if (this.map.redraw) {
      this.map.redraw();
    }
  }

  private _attachEvents(): void {
    this.bar.addEventListener("mousedown", this._onBarDown);
    // passive: true — we don't call preventDefault on touchstart
    this.bar.addEventListener("touchstart", this._onBarDown, { passive: true });

    document.addEventListener("mousemove", this._onDocMove as EventListener);
    document.addEventListener("mouseup", this._onDocUp);
    // passive: false — we need to prevent scroll while dragging on touch
    document.addEventListener("touchmove", this._onDocMove as EventListener, {
      passive: false,
    });
    document.addEventListener("touchend", this._onDocUp);

    this.map.on("resize", this._onMapResize);
  }

  private _handleBarDown(e: MouseEvent | TouchEvent): void {
    // Ignore right / middle clicks
    if ("button" in e && (e as MouseEvent).button !== 0) return;
    e.stopPropagation();
    this.dragging = true;
  }

  private _handleDocMove(e: MouseEvent | TouchEvent): void {
    if (!this.dragging) return;

    // Block page scroll while dragging on touch devices
    if ("touches" in e) {
      try {
        e.preventDefault();
      } catch {
        /* passive listener — ignore */
      }
    }

    const { clientX, clientY } =
      "touches" in e ? (e as TouchEvent).touches[0] : (e as MouseEvent);

    const rect = this.map.getContainer().getBoundingClientRect();
    const raw =
      this.opts.orientation === "vertical"
        ? (clientX - rect.left) / rect.width
        : (clientY - rect.top) / rect.height;

    this.ratio = clamp01(raw);
    this._updateBarPosition();
    this._repaint();
  }

  private _handleDocUp(): void {
    this.dragging = false;
  }
}
