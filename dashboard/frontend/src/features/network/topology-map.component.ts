import { LitElement, html, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { OtTableData } from "@/shared/types/websocket.type";
import type { ConnectionStatus } from "shared/src/types";
import { store } from "@/store/store";
import { createLocaleController } from "@/core/i18n/locale-controller";
import { LitStoreController, shallowEqual } from "@namorix/core/store";
import { selectBrStatus, selectChildTable, selectOtConfig, selectRouterTable } from "@/store/selectors";
import { t } from "@/core/i18n/i18n";

import "./topology-map.style.scss";

// ─── Có thể chỉnh tay: pan/zoom và layout ─────────────────────────────────────
const LERP = 0.12;

/** Khoảng cách layout (nhỏ hơn = node gần nhau hơn). Tỷ lệ so với min(W,H) hoặc W/H. */
const LAYOUT_R1_RATIO = 0.12; // Router vòng 1 (từ leader)
const LAYOUT_R2_RATIO = 0.36; // Child vòng 2
const LAYOUT_IDEAL_LEADER_ROUTER = 0.22; // Force: chiều dài lò xo leader–router
const LAYOUT_IDEAL_ROUTER_CHILD = 0.14;  // Force: chiều dài lò xo router–child
const LAYOUT_PAD = 55;                    // Lề node so với cạnh view
const LAYOUT_JITTER_R1 = 0.12;           // Jitter router (nhân với R1)
const LAYOUT_JITTER_CHILD = 32;          // Jitter child (px)

/** Force-directed: repulsion/spring/gravity — chỉnh nếu đổi scale layout. */
const LAYOUT_REPULSION = 18000;
const LAYOUT_SPRING_K = 0.045;
const LAYOUT_GRAVITY = 0.001;
const LAYOUT_DAMPING = 0.86;
const LAYOUT_ITERATIONS = 400;

/** Ít node: dùng placement thủ công; góc lệch để tránh thẳng hàng dọc. */
const FEW_NODES_THRESHOLD = 3;
const SYMMETRY_BREAK_ANGLE = 0.52;

function colIndex(headers: string[] | undefined, name: string): number {
  if (!headers?.length) return -1;
  const n = String(name).trim().toLowerCase();
  return headers.findIndex((h) => String(h).trim().toLowerCase() === n);
}

function parseRloc16(cell: string): number | null {
  if (cell == null || cell === "") return null;
  const hex = String(cell).replace(/^0x/i, "").trim();
  const n = parseInt(hex, 16);
  return Number.isNaN(n) ? null : n;
}

const ICON_MAP: Record<string, string> = {
  leader: "hub",
  router: "router",
  sensor: "sensors",
  light: "lightbulb",
  outlet: "smart_outlet",
  thermo: "thermostat",
  default: "device_hub",
};

/** Dữ liệu mẫu: 6 node (1 leader + 2 router + 3 child), có node offline và nhánh router→child. */
const SAMPLE_ROUTER_TABLE: OtTableData = {
  headers: ["RLOC16", "ExtAddress", "Link"],
  rows: [
    ["0x8C00", "AA:BB:CC:DD:EE:01", "1"],
    ["0xA400", "AA:BB:CC:DD:EE:02", "1"],
  ],
};

const SAMPLE_CHILD_TABLE: OtTableData = {
  headers: ["RLOC16", "ExtAddress", "Timeout"],
  rows: [
    ["0x1001", "AA:BB:CC:DD:EE:11", "120"],
    ["0x1002", "AA:BB:CC:DD:EE:12", "120"],
    ["0x1003", "AA:BB:CC:DD:EE:13", "120"],
  ],
};

/** Khi dùng sample, các node có id trong set này hiển thị offline. */
const SAMPLE_OFFLINE_IDS = new Set(["child-0x1002"]);

/** Tên hiển thị cho sample: ưu tiên tên, không có mới dùng RLOC. */
const SAMPLE_NODE_NAMES: Record<string, string> = {
  leader: "OTBR-01",
  "router-0x8C00": "Living Room",
  "router-0xA400": "Thermostat",
  "child-0x1001": "Bedroom Fan",
  "child-0x1002": "Sensor 3F",
  "child-0x1003": "Kitchen Plug",
};

/** LQI mẫu theo node (0=offline, 1=weak, 2=medium, 3=good). Kích thước node theo LQI. */
const SAMPLE_LQI: Record<string, number> = {
  leader: 3,
  "router-0x8C00": 3,
  "router-0xA400": 3,
  "child-0x1001": 2,
  "child-0x1002": 0,
  "child-0x1003": 2,
};

type NodeKind = "leader" | "router" | "child";
type LayoutNode = {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  rloc16: number | null;
  label: string;
  icon: string;
  isBr: boolean;
  offline?: boolean;
  /** 0=offline, 1=weak, 2=medium, 3=good — dùng cho kích thước node (link quality). */
  lqi?: number;
};

type Edge = { fromId: string; toId: string; type: "router" | "child" };

/** Bán kính node theo role + LQI (link quality). */
function getNodeRadius(node: LayoutNode): number {
  if (node.kind === "leader") return 34;
  if (node.offline || node.lqi === 0) return 16;
  if (node.lqi === 3) return 28;
  if (node.lqi === 2) return 24;
  if (node.lqi === 1) return 20;
  return node.kind === "router" ? 24 : 18;
}

// ─── Force-directed layout ────────────────────────────────────────────────────
type Vec2 = { x: number; y: number };

interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
}
interface ForceEdge {
  source: string;
  target: string;
  idealLength: number;
}

function runForceLayout(
  fnodes: ForceNode[],
  fedges: ForceEdge[],
  iterations: number,
  W: number,
  H: number
): Map<string, Vec2> {
  const cx = W / 2;
  const cy = H / 2;
  const nodeMap = new Map(fnodes.map((n) => [n.id, n]));

  for (let iter = 0; iter < iterations; iter++) {
    for (const n of fnodes) {
      n.vx = 0;
      n.vy = 0;
    }

    for (let i = 0; i < fnodes.length; i++) {
      for (let j = i + 1; j < fnodes.length; j++) {
        const a = fnodes[i]!;
        const b = fnodes[j]!;
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const dist2 = dx * dx + dy * dy;
        const dist = Math.sqrt(dist2) || 0.01;
        const force = LAYOUT_REPULSION / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.fixed) {
          a.vx -= fx;
          a.vy -= fy;
        }
        if (!b.fixed) {
          b.vx += fx;
          b.vy += fy;
        }
      }
    }

    for (const e of fedges) {
      const a = nodeMap.get(e.source);
      const b = nodeMap.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = LAYOUT_SPRING_K * (dist - e.idealLength);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.fixed) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.fixed) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    for (const n of fnodes) {
      if (n.fixed) continue;
      n.vx += (cx - n.x) * LAYOUT_GRAVITY;
      n.vy += (cy - n.y) * LAYOUT_GRAVITY;
    }

    for (const n of fnodes) {
      if (n.fixed) continue;
      n.vx *= LAYOUT_DAMPING;
      n.vy *= LAYOUT_DAMPING;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(LAYOUT_PAD, Math.min(W - LAYOUT_PAD, n.x));
      n.y = Math.max(LAYOUT_PAD, Math.min(H - LAYOUT_PAD, n.y));
    }
  }

  return new Map(fnodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}

function seeded(i: number): number {
  return Math.sin(i * 127.1 + 311.7) * 0.5 + 0.5;
}

// ─── Manual placement cho ít node (phá symmetry, tránh thẳng hàng dọc) ────────
function computeFewNodesLayout(
  W: number,
  H: number,
  routerCount: number,
  childCount: number
): Map<string, Vec2> {
  const cx = W / 2;
  const cy = H / 2;
  const R1 = Math.min(W, H) * LAYOUT_R1_RATIO;
  const R2 = Math.min(W, H) * LAYOUT_R2_RATIO;
  const positions = new Map<string, Vec2>();

  positions.set("leader", { x: cx, y: cy });

  const nR = Math.max(1, routerCount);
  // Góc bắt đầu lệch + jitter ngang để không còn thẳng đứng
  for (let i = 0; i < routerCount; i++) {
    const angle = SYMMETRY_BREAK_ANGLE - Math.PI / 2 + (2 * Math.PI * i) / nR;
    const jitterX = (seeded(i) - 0.5) * 0.18 * R1;
    const jitterY = (seeded(i + 50) - 0.5) * 0.12 * R1;
    positions.set(`router-${i}`, {
      x: cx + R1 * Math.cos(angle) + jitterX,
      y: cy + R1 * Math.sin(angle) + jitterY,
    });
  }

  for (let i = 0; i < childCount; i++) {
    const parentIdx = i % nR;
    const parentAngle =
      SYMMETRY_BREAK_ANGLE - Math.PI / 2 + (2 * Math.PI * parentIdx) / nR;
    const spread = Math.PI / Math.max(3, childCount + 1);
    const angle = parentAngle + (i + 1) * spread + (seeded(i + 100) - 0.5) * 0.4;
    const jitterX = (seeded(i + 200) - 0.5) * 28;
    const jitterY = (seeded(i + 300) - 0.5) * 28;
    positions.set(`child-${i}`, {
      x: cx + R2 * Math.cos(angle) + jitterX,
      y: cy + R2 * Math.sin(angle) + jitterY,
    });
  }

  return positions;
}

// ─── Spotlight canvas helpers (screen coords từ viewBox + pan/scale) ─────────
function drawSpotlight(
  canvas: HTMLCanvasElement,
  nodes: LayoutNode[],
  edges: Edge[],
  opts: { pan: { x: number; y: number }; scale: number; viewW: number; viewH: number }
) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { pan, scale, viewW, viewH } = opts;
  const scaleSvg = Math.min(W / viewW, H / viewH);
  const offsetX = (W - viewW * scaleSvg) / 2;
  const offsetY = (H - viewH * scaleSvg) / 2;
  const toScreen = (vx: number, vy: number) => ({
    sx: offsetX + (pan.x + vx * scale) * scaleSvg,
    sy: offsetY + (pan.y + vy * scale) * scaleSvg,
  });
  const screenR = (r: number) => r * scale * scaleSvg;

  ctx.clearRect(0, 0, W, H);

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(8,20,32,0.35)"; // match $bg-topology #081420
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = "destination-out";

  for (const n of nodes) {
    const { sx, sy } = toScreen(n.x, n.y);
    const r = n.kind === "leader" ? 280 : n.kind === "router" ? 200 : 150;
    const alpha = n.offline ? 0.25 : 0.75; // đục ít hơn = thấy grid nhiều hơn

    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, screenR(r));
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(0.25, `rgba(0,0,0,${alpha * 0.85})`);
    g.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.42})`);
    g.addColorStop(0.82, `rgba(0,0,0,${alpha * 0.08})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    ctx.arc(sx, sy, screenR(r), 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  for (const e of edges) {
    const fromNode = nodes.find((n) => n.id === e.fromId);
    const toNode = nodes.find((n) => n.id === e.toId);
    if (!fromNode || !toNode || fromNode.offline) continue;

    const x1 = fromNode.x;
    const y1 = fromNode.y;
    const x2 = toNode.x;
    const y2 = toNode.y;
    const edgeR = e.type === "router" ? 100 : 75;
    for (let t = 0.15; t <= 0.85; t += 0.22) {
      const vx = x1 + (x2 - x1) * t;
      const vy = y1 + (y2 - y1) * t;
      const { sx, sy } = toScreen(vx, vy);
      const r = screenR(edgeR);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, "rgba(0,0,0,0.52)");
      g.addColorStop(0.5, "rgba(0,0,0,0.18)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = "source-over";
  for (const n of nodes) {
    if (n.offline) continue;
    const { sx, sy } = toScreen(n.x, n.y);
    const tintR = screenR(n.kind === "leader" ? 200 : 130);
    const tintA = n.kind === "leader" ? 0.18 : 0.1;
    const color = "0, 200, 255"; // #00C8FF cyan — topology spotlight
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, tintR);
    g.addColorStop(0, `rgba(${color},${tintA})`);
    g.addColorStop(0.5, `rgba(${color},${tintA * 0.3})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.beginPath();
    ctx.arc(sx, sy, tintR, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
}

// ─────────────────────────────────────────────────────────────────────────────

@customElement("topology-map")
export class TopologyMapComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  private readonly locale = createLocaleController(this);

  private readonly appState = new LitStoreController(
    this,
    store,
    (s) => ({
      routerTable: selectRouterTable(s),
      childTable: selectChildTable(s),
      otConfig: selectOtConfig(s),
      brStatus: selectBrStatus(s) as ConnectionStatus | null,
    }),
    shallowEqual
  );

  /** true = luôn dùng sample (6 node, có offline, nhánh router→child). false = dùng dữ liệu thật từ BR. */
  @property({ type: Boolean }) useSampleData = true;

  /** Map nodeId → tên hiển thị (ưu tiên tên, không có mới dùng RLOC). */
  @property({ type: Object }) nodeNames: Record<string, string> | null = null;

  @state() private containerSize = { w: 800, h: 600 };
  @state() private selectedNodeId: string | null = null;

  private _cachedLayout: { nodes: LayoutNode[]; edges: Edge[] } | null = null;
  private _layoutKey = "";

  private _currentPan = { x: 0, y: 0 };
  private _targetPan = { x: 0, y: 0 };
  private _currentScale = 1;
  private _targetScale = 1;
  private _rafId = 0;
  private _viewport: SVGGElement | null = null;
  private _canvasEl: HTMLCanvasElement | null = null;
  private _isDragging = false;
  private _resizeObserver: ResizeObserver | null = null;
  private _containerEl: HTMLElement | null = null;

  private _nodePositions = new Map<string, { x: number; y: number }>();
  private _dragNodeId: string | null = null;
  private _dragOffset = { x: 0, y: 0 };
  private _dragMoved = false;
  private _rippleNodeId: string | null = null;
  private _rippleTimeout = 0;

  private static readonly SCALE_MIN = 0.25;
  private static readonly SCALE_MAX = 3.5;

  override firstUpdated() {
    this._viewport = this.querySelector(".topology-viewport");
    this._canvasEl = this.querySelector(".topology-spotlight");
    this._containerEl = this.querySelector(".topology-map");

    if (this._containerEl) {
      this._resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            this.containerSize = { w: Math.round(width), h: Math.round(height) };
            if (this._canvasEl) {
              this._canvasEl.width = Math.round(width);
              this._canvasEl.height = Math.round(height);
            }
          }
        }
      });
      this._resizeObserver.observe(this._containerEl);
      this._containerEl.addEventListener("wheel", this._onWheel, { passive: false });
    }

    this._animateLoop();
    const hasReal =
      (this.appState.value.routerTable?.rows?.length ?? 0) > 0 ||
      (this.appState.value.childTable?.rows?.length ?? 0) > 0;
    if (!hasReal) setTimeout(() => this._fitView(), 120);
  }

  override disconnectedCallback() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._rippleTimeout) window.clearTimeout(this._rippleTimeout);
    this._resizeObserver?.disconnect();
    this._containerEl?.removeEventListener("wheel", this._onWheel);
    super.disconnectedCallback();
  }

  private _animateLoop = () => {
    this._currentPan.x += (this._targetPan.x - this._currentPan.x) * LERP;
    this._currentPan.y += (this._targetPan.y - this._currentPan.y) * LERP;
    this._currentScale += (this._targetScale - this._currentScale) * LERP;

    const t = `translate(${this._currentPan.x}, ${this._currentPan.y}) scale(${this._currentScale})`;
    this._viewport?.setAttribute("transform", t);

    if (this._canvasEl) {
      const { w, h } = this.containerSize;
      const effectiveNodes = this._getEffectiveNodes();
      const { edges } = this._getLayout();
      drawSpotlight(this._canvasEl, effectiveNodes, edges, {
        pan: this._currentPan,
        scale: this._currentScale,
        viewW: w,
        viewH: h,
      });
    }

    this._rafId = requestAnimationFrame(this._animateLoop);
  };

  private _onPointerDown = (e: PointerEvent) => {
    if ((e.target as Element)?.closest?.(".topology-node")) return;
    this._isDragging = true;
    (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
  };

  private _onPointerMove = (e: PointerEvent) => {
    if (this._dragNodeId) {
      const pt = this._pointerToLayoutPos(e);
      if (pt) {
        this._nodePositions.set(this._dragNodeId, {
          x: pt.x - this._dragOffset.x,
          y: pt.y - this._dragOffset.y,
        });
        this._dragMoved = true;
        this.requestUpdate();
      }
      return;
    }
    if (!this._isDragging) return;
    this._targetPan.x += e.movementX;
    this._targetPan.y += e.movementY;
  };

  private _onPointerUp = (e: PointerEvent) => {
    if (this._dragNodeId) {
      this._containerEl?.releasePointerCapture?.(e.pointerId);
      this._dragNodeId = null;
      return;
    }
    this._isDragging = false;
    (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  };

  private _viewBoxUnderMouse(evt: WheelEvent): { vx: number; vy: number } | null {
    const el = this._containerEl;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const { w, h } = this.containerSize;
    const scaleSvg = Math.min(rect.width / w, rect.height / h);
    const offsetX = (rect.width - w * scaleSvg) / 2;
    const offsetY = (rect.height - h * scaleSvg) / 2;
    const mx = evt.clientX - rect.left;
    const my = evt.clientY - rect.top;
    return {
      vx: (mx - offsetX) / scaleSvg,
      vy: (my - offsetY) / scaleSvg,
    };
  }

  private _onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const pt = this._viewBoxUnderMouse(e);
    if (!pt) return;
    const f = e.deltaY > 0 ? 0.9 : 1.1;
    this._targetScale = Math.min(
      TopologyMapComponent.SCALE_MAX,
      Math.max(TopologyMapComponent.SCALE_MIN, this._targetScale * f)
    );
    this._targetPan.x = this._targetPan.x * f + pt.vx * (1 - f);
    this._targetPan.y = this._targetPan.y * f + pt.vy * (1 - f);
  };

  private _zoomBy(f: number) {
    const { w, h } = this.containerSize;
    const cx = w / 2;
    const cy = h / 2;
    this._targetScale = Math.min(
      TopologyMapComponent.SCALE_MAX,
      Math.max(TopologyMapComponent.SCALE_MIN, this._targetScale * f)
    );
    this._targetPan.x = this._targetPan.x * f + cx * (1 - f);
    this._targetPan.y = this._targetPan.y * f + cy * (1 - f);
  }

  private _fitView() {
    const { nodes } = this._getLayout();
    const { w, h } = this.containerSize;
    if (nodes.length === 0) return;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 100;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scaleX = (w - pad * 2) / rangeX;
    const scaleY = (h - pad * 2) / rangeY;
    this._targetScale = Math.min(scaleX, scaleY, 1.8);
    this._targetPan.x = w / 2 - ((minX + maxX) / 2) * this._targetScale;
    this._targetPan.y = h / 2 - ((minY + maxY) / 2) * this._targetScale;
  }

  private _getLayout(): { nodes: LayoutNode[]; edges: Edge[] } {
    const { routerTable, childTable } = this.appState.value;
    const hasRealData =
      !this.useSampleData &&
      ((routerTable?.rows?.length ?? 0) > 0 ||
        (childTable?.rows?.length ?? 0) > 0);
    const rCount = hasRealData
      ? (routerTable?.rows?.length ?? 0)
      : (SAMPLE_ROUTER_TABLE.rows?.length ?? 0);
    const cCount = hasRealData
      ? (childTable?.rows?.length ?? 0)
      : (SAMPLE_CHILD_TABLE.rows?.length ?? 0);
    const key = JSON.stringify([
      rCount,
      cCount,
      this.containerSize.w,
      this.containerSize.h,
      this.nodeNames ?? "",
    ]);
    if (key !== this._layoutKey || !this._cachedLayout) {
      this._layoutKey = key;
      this._nodePositions.clear();
      this._cachedLayout = this._computeLayout();
    }
    return this._cachedLayout;
  }

  private _getNodePosition(node: LayoutNode): { x: number; y: number } {
    const override = this._nodePositions.get(node.id);
    return override ?? { x: node.x, y: node.y };
  }

  private _getEffectiveNodes(): LayoutNode[] {
    const { nodes } = this._getLayout();
    return nodes.map((n) => {
      const pos = this._getNodePosition(n);
      return { ...n, x: pos.x, y: pos.y };
    });
  }

  private _pointerToLayoutPos(evt: PointerEvent): { x: number; y: number } | null {
    const el = this._containerEl;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const { w } = this.containerSize;
    const scaleSvg = Math.min(rect.width / w, rect.height / this.containerSize.h);
    const offsetX = (rect.width - w * scaleSvg) / 2;
    const offsetY = (rect.height - this.containerSize.h * scaleSvg) / 2;
    const vx = (evt.clientX - rect.left - offsetX) / scaleSvg;
    const vy = (evt.clientY - rect.top - offsetY) / scaleSvg;
    return {
      x: (vx - this._currentPan.x) / this._currentScale,
      y: (vy - this._currentPan.y) / this._currentScale,
    };
  }

  private _onNodePointerDown = (e: PointerEvent, node: LayoutNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const pt = this._pointerToLayoutPos(e);
    if (!pt) return;
    const pos = this._getNodePosition(node);
    this._dragNodeId = node.id;
    this._dragOffset = { x: pt.x - pos.x, y: pt.y - pos.y };
    this._dragMoved = false;
    this._containerEl?.setPointerCapture?.(e.pointerId);
  };

  private _computeLayout(): { nodes: LayoutNode[]; edges: Edge[] } {
    const { routerTable: rt, childTable: ct, brStatus } = this.appState.value;
    const { w: W, h: H } = this.containerSize;
    const cx = W / 2;
    const cy = H / 2;

    const hasRealData =
      !this.useSampleData &&
      ((rt?.rows?.length ?? 0) > 0 ||
        (ct?.rows?.length ?? 0) > 0);
    const routerTable = hasRealData ? rt : SAMPLE_ROUTER_TABLE;
    const childTable = hasRealData ? ct : SAMPLE_CHILD_TABLE;

    const rHeaders = routerTable?.headers ?? [];
    const cHeaders = childTable?.headers ?? [];
    const rRlocCol = colIndex(rHeaders, "RLOC16");
    const cRlocCol = colIndex(cHeaders, "RLOC16");
    const rNameCol = colIndex(rHeaders, "Name");
    const cNameCol = colIndex(cHeaders, "Name");
    const rLqiCol = colIndex(rHeaders, "LQI");
    const cLqiCol = colIndex(cHeaders, "LQI");
    const routerRows = routerTable?.rows ?? [];
    const childRows = childTable?.rows ?? [];
    const brConnected = brStatus?.isConnected ?? false;

    const resolveLabel = (id: string, rlocFallback: string, nameFromRow?: string): string => {
      const fromRow = nameFromRow?.trim();
      if (fromRow) return fromRow;
      const fromProp = this.nodeNames?.[id];
      if (fromProp) return fromProp;
      if (!hasRealData && SAMPLE_NODE_NAMES[id]) return SAMPLE_NODE_NAMES[id]!;
      return rlocFallback;
    };

    const resolveLqi = (id: string, lqiFromRow?: string): number | undefined => {
      if (lqiFromRow != null && lqiFromRow !== "") {
        const n = parseInt(lqiFromRow, 10);
        if (n >= 0 && n <= 3) return n;
      }
      if (!hasRealData && SAMPLE_LQI[id] != null) return SAMPLE_LQI[id];
      return 2;
    };

    const numRouters = Math.max(1, routerRows.length);
    const useFewNodesLayout =
      routerRows.length + childRows.length <= FEW_NODES_THRESHOLD;

    const positions = useFewNodesLayout
      ? computeFewNodesLayout(W, H, routerRows.length, childRows.length)
      : (() => {
          const fnodes: ForceNode[] = [];
          const fedges: ForceEdge[] = [];

          fnodes.push({ id: "leader", x: cx, y: cy, vx: 0, vy: 0, fixed: true });

          const R1_INIT = Math.min(W, H) * LAYOUT_R1_RATIO;
          routerRows.forEach((_, i) => {
            const angle =
              (2 * Math.PI * i) / Math.max(1, routerRows.length) - Math.PI / 2;
            const jitter = R1_INIT * LAYOUT_JITTER_R1;
            fnodes.push({
              id: `router-${i}`,
              x: cx + R1_INIT * Math.cos(angle) + (seeded(i) - 0.5) * jitter,
              y: cy + R1_INIT * Math.sin(angle) + (seeded(i + 50) - 0.5) * jitter,
              vx: 0,
              vy: 0,
              fixed: false,
            });
            fedges.push({
              source: "leader",
              target: `router-${i}`,
              idealLength: Math.min(W, H) * LAYOUT_IDEAL_LEADER_ROUTER,
            });
          });

          const R2_INIT = Math.min(W, H) * LAYOUT_R2_RATIO;
          childRows.forEach((_, i) => {
            const parentIdx = i % numRouters;
            const parentAngle =
              (2 * Math.PI * parentIdx) / numRouters - Math.PI / 2;
            const angle =
              parentAngle +
              (i + 1) * (Math.PI / Math.max(3, childRows.length + 1)) +
              (seeded(i + 100) - 0.5) * 0.5;
            fnodes.push({
              id: `child-${i}`,
              x: cx + R2_INIT * Math.cos(angle) + (seeded(i + 200) - 0.5) * LAYOUT_JITTER_CHILD,
              y: cy + R2_INIT * Math.sin(angle) + (seeded(i + 300) - 0.5) * LAYOUT_JITTER_CHILD,
              vx: 0,
              vy: 0,
              fixed: false,
            });
            fedges.push({
              source: `router-${parentIdx}`,
              target: `child-${i}`,
              idealLength: Math.min(W, H) * LAYOUT_IDEAL_ROUTER_CHILD,
            });
          });

          return runForceLayout(
            fnodes,
            fedges,
            LAYOUT_ITERATIONS,
            W,
            H
          );
        })();

    const nodes: LayoutNode[] = [];
    const edges: Edge[] = [];

    const leaderPos = positions.get("leader") ?? { x: cx, y: cy };
    const leaderNode: LayoutNode = {
      id: "leader",
      kind: "leader",
      x: leaderPos.x,
      y: leaderPos.y,
      rloc16: null,
      label: resolveLabel("leader", "BR"),
      icon: ICON_MAP.leader,
      isBr: brConnected,
      lqi: resolveLqi("leader"),
    };
    nodes.push(leaderNode);

    const routerNodes: LayoutNode[] = [];
    routerRows.forEach((row, i) => {
      const rlocCell = rRlocCol >= 0 ? row[rRlocCol] : "";
      const pos = positions.get(`router-${i}`) ?? { x: cx, y: cy };
      const id = `router-${rlocCell ?? i}`;
      const nameFromRow = rNameCol >= 0 ? row[rNameCol] : undefined;
      const lqiFromRow = rLqiCol >= 0 ? row[rLqiCol] : undefined;
      const n: LayoutNode = {
        id,
        kind: "router",
        x: pos.x,
        y: pos.y,
        rloc16: parseRloc16(rlocCell),
        label: resolveLabel(id, rlocCell ?? `R${i}`, nameFromRow),
        icon: ICON_MAP.router,
        isBr: false,
        lqi: resolveLqi(id, lqiFromRow),
      };
      routerNodes.push(n);
      nodes.push(n);
      edges.push({
        fromId: "leader",
        toId: n.id,
        type: "router",
      });
    });

    childRows.forEach((r, i) => {
      const rlocCell = cRlocCol >= 0 ? r[cRlocCol] : "";
      const pos = positions.get(`child-${i}`) ?? { x: cx, y: cy };
      const parentIdx = i % numRouters;
      const parent = routerNodes[parentIdx];
      const childId = `child-${rlocCell ?? i}`;
      const nameFromRow = cNameCol >= 0 ? r[cNameCol] : undefined;
      const childLqiFromRow = cLqiCol >= 0 ? r[cLqiCol] : undefined;
      nodes.push({
        id: childId,
        kind: "child",
        x: pos.x,
        y: pos.y,
        rloc16: parseRloc16(rlocCell),
        label: resolveLabel(childId, rlocCell ?? `C${i}`, nameFromRow),
        icon: ICON_MAP.default,
        isBr: false,
        offline: !hasRealData && SAMPLE_OFFLINE_IDS.has(childId),
        lqi: resolveLqi(childId, childLqiFromRow),
      });
      if (parent) {
        edges.push({
          fromId: parent.id,
          toId: childId,
          type: "child",
        });
      }
    });

    return { nodes, edges };
  }

  private _selectNode(id: string | null) {
    this.selectedNodeId = id;
  }

  render() {
    void this.locale.value;
    const { nodes, edges } = this._getLayout();
    const { w, h } = this.containerSize;
    const viewBox = `0 0 ${w} ${h}`;

    return html`
      <div
        class="topology-map"
        tabindex="0"
        role="application"
        aria-label=${t("topology.aria.map")}
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointerleave=${this._onPointerUp}
      >
        <canvas
          class="topology-spotlight"
          width=${w}
          height=${h}
        ></canvas>

        <svg
          class="topology-svg"
          viewBox=${viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <filter id="topo-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g class="topology-viewport">
            <g class="topology-edges" filter="url(#topo-glow)">
              ${edges.map((e) => {
                const fromNode = nodes.find((n) => n.id === e.fromId);
                const toNode = nodes.find((n) => n.id === e.toId);
                if (!fromNode || !toNode || fromNode.offline || toNode.offline) return svg``;
                const p1 = this._getNodePosition(fromNode);
                const p2 = this._getNodePosition(toNode);
                return svg`<line
                  class="edge edge--${e.type}"
                  x1="${p1.x}"
                  y1="${p1.y}"
                  x2="${p2.x}"
                  y2="${p2.y}"
                />`;
              })}
            </g>

            <g class="topology-nodes">
              ${nodes.map((node) => {
                const pos = this._getNodePosition(node);
                const isSelected = this.selectedNodeId === node.id;
                const r = getNodeRadius(node);
                const isDragging = this._dragNodeId === node.id;
                const showRipple = this._rippleNodeId === node.id;
                const lqiClass = node.lqi != null ? `topology-node--lqi-${node.lqi}` : "";
                const classes = [
                  "topology-node",
                  `topology-node--${node.kind}`,
                  lqiClass,
                  node.isBr ? "topology-node--br" : "",
                  isSelected ? "topology-node--selected" : "",
                  node.offline ? "topology-node--offline" : "",
                  isDragging ? "topology-node--dragging topology-node--lift" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return svg`<g
                  class="${classes}"
                  transform="translate(${pos.x}, ${pos.y})"
                  @pointerdown=${(ev: PointerEvent) => this._onNodePointerDown(ev, node)}
                  @click=${(ev: MouseEvent) => {
                    ev.stopPropagation();
                    if (this._dragMoved) {
                      this._dragMoved = false;
                      return;
                    }
                    if (this._rippleTimeout) window.clearTimeout(this._rippleTimeout);
                    this._rippleNodeId = node.id;
                    this._rippleTimeout = window.setTimeout(() => {
                      this._rippleNodeId = null;
                      this._rippleTimeout = 0;
                      this.requestUpdate();
                    }, 500);
                    this._selectNode(this.selectedNodeId === node.id ? null : node.id);
                  }}
                >
                  ${showRipple ? svg`<circle class="node__ripple" r="50" fill="none" stroke="currentColor"/>` : ""}
                  <g class="node__inner">
                    ${node.kind === "leader"
                      ? svg`
                      <circle class="node__pulse" r="${r}" fill="none" stroke-width="1.2"/>
                      <circle class="node__pulse" r="${r}" fill="none" stroke-width="1.2" style="animation-delay:1.4s"/>
                    `
                      : ""}

                    ${node.isBr
                      ? svg`
                      <circle class="node__br-ring" r="${r + 8}" fill="none" stroke-width="1.5"/>
                    `
                      : ""}

                    ${isSelected ? svg`<circle class="node__selected-ring" r="${r + 6}" fill="none"/>` : ""}
                    <circle class="node__body" r="${r}" />

                    <text
                      class="node__icon"
                      text-anchor="middle"
                      dominant-baseline="central"
                      y="1"
                    >${node.icon}</text>

                    ${(() => {
                      const labelText = node.offline ? t("topology.node.offline") : node.label;
                      const labelW = Math.max(80, labelText.length * 6.5 + 20);
                      const labelX = -labelW / 2;
                      return svg`<rect
                        class="node__label-bg ${isSelected ? "node__label-bg--selected" : ""} ${node.offline ? "node__label-bg--offline" : ""}"
                        x="${labelX}"
                        y="${r + 5}"
                        width="${labelW}"
                        height="18"
                        rx="4"
                      />
                      <text
                        class="node__label ${isSelected ? "node__label--selected" : ""}"
                        dy="${r + 17}"
                        text-anchor="middle"
                      >${labelText}</text>`;
                    })()}
                  </g>
                </g>`;
              })}
            </g>
          </g>
        </svg>

        <div class="topology-zoom" aria-label=${t("topology.aria.zoom")}>
          <button
            type="button"
            class="topology-zoom__btn"
            @click=${() => this._zoomBy(1.2)}
            aria-label=${t("topology.zoom.in")}
          >
            <span class="material-symbols-outlined">add</span>
          </button>
          <button
            type="button"
            class="topology-zoom__btn"
            @click=${() => this._zoomBy(0.83)}
            aria-label=${t("topology.zoom.out")}
          >
            <span class="material-symbols-outlined">remove</span>
          </button>
          <button
            type="button"
            class="topology-zoom__btn"
            @click=${() => this._fitView()}
            aria-label=${t("topology.zoom.fit")}
          >
            <span class="material-symbols-outlined">fit_screen</span>
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "topology-map": TopologyMapComponent;
  }
}
