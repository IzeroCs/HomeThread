import { LitElement, html, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { OtTableData, OtConfig } from "@shared/types/websocket.type";
import type { ConnectionStatus } from "shared/src/types";

import "@features/topology/topology-map.style.scss";

const LERP = 0.12;

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
};

type Edge = { x1: number; y1: number; x2: number; y2: number; type: "router" | "child" };

// ─── Force-directed layout (no d3) ───────────────────────────────────────────
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

const REPULSION = 12000;
const SPRING_K = 0.05;
const GRAVITY = 0.0015;
const DAMPING = 0.88;
const LAYOUT_ITERATIONS = 350;
const LAYOUT_PAD = 60;

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
        const force = REPULSION / dist2;
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
      const force = SPRING_K * (dist - e.idealLength);
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
      n.vx += (cx - n.x) * GRAVITY;
      n.vy += (cy - n.y) * GRAVITY;
    }

    for (const n of fnodes) {
      if (n.fixed) continue;
      n.vx *= DAMPING;
      n.vy *= DAMPING;
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

@customElement("topology-map")
export class TopologyMapComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Object }) routerTable: OtTableData | null = null;
  @property({ type: Object }) childTable: OtTableData | null = null;
  @property({ type: Object }) otConfig: OtConfig | null = null;
  @property({ type: Object }) brStatus: ConnectionStatus | null = null;

  @state() private containerSize = { w: 800, h: 600 };
  @state() private selectedNodeId: string | null = null;

  private _cachedLayout: { nodes: LayoutNode[]; edges: Edge[] } | null = null;
  private _layoutKey = "";

  private _currentPan = { x: 0, y: 0 };
  private _targetPan = { x: 0, y: 0 };
  private _rafId = 0;
  private _viewport: SVGGElement | null = null;
  private _isDragging = false;
  private _resizeObserver: ResizeObserver | null = null;
  private _containerEl: HTMLElement | null = null;

  override firstUpdated() {
    this._viewport = this.querySelector(".topology-viewport");
    this._containerEl = this.querySelector(".topology-map");
    if (this._containerEl) {
      this._resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            this.containerSize = { w: Math.round(width), h: Math.round(height) };
          }
        }
      });
      this._resizeObserver.observe(this._containerEl);
    }
    this._animateLoop();
  }

  override disconnectedCallback() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._resizeObserver?.disconnect();
    super.disconnectedCallback();
  }

  private _animateLoop = () => {
    this._currentPan.x += (this._targetPan.x - this._currentPan.x) * LERP;
    this._currentPan.y += (this._targetPan.y - this._currentPan.y) * LERP;
    this._viewport?.setAttribute(
      "transform",
      `translate(${this._currentPan.x}, ${this._currentPan.y})`
    );
    this._rafId = requestAnimationFrame(this._animateLoop);
  };

  private _onPointerDown = (e: PointerEvent) => {
    if ((e.target as Element)?.closest?.(".topology-node")) return;
    this._isDragging = true;
    (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
  };

  private _onPointerMove = (e: PointerEvent) => {
    if (!this._isDragging) return;
    this._targetPan.x += e.movementX;
    this._targetPan.y += e.movementY;
  };

  private _onPointerUp = (e: PointerEvent) => {
    this._isDragging = false;
    (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  };

  private _getLayout(): { nodes: LayoutNode[]; edges: Edge[] } {
    const key = JSON.stringify([
      this.routerTable?.rows?.length ?? 0,
      this.childTable?.rows?.length ?? 0,
      this.containerSize.w,
      this.containerSize.h,
    ]);
    if (key !== this._layoutKey || !this._cachedLayout) {
      this._layoutKey = key;
      this._cachedLayout = this._computeLayout();
    }
    return this._cachedLayout;
  }

  private _computeLayout(): { nodes: LayoutNode[]; edges: Edge[] } {
    const { w: W, h: H } = this.containerSize;
    const cx = W / 2;
    const cy = H / 2;

    const rHeaders = this.routerTable?.headers ?? [];
    const cHeaders = this.childTable?.headers ?? [];
    const rRlocCol = colIndex(rHeaders, "RLOC16");
    const cRlocCol = colIndex(cHeaders, "RLOC16");
    const routerRows = this.routerTable?.rows ?? [];
    const childRows = this.childTable?.rows ?? [];
    const brConnected = this.brStatus?.isConnected ?? false;

    const fnodes: ForceNode[] = [];
    const fedges: ForceEdge[] = [];

    fnodes.push({ id: "leader", x: cx, y: cy, vx: 0, vy: 0, fixed: true });

    const R1_INIT = Math.min(W, H) * 0.25;
    routerRows.forEach((_, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, routerRows.length) - Math.PI / 2;
      const jitter = R1_INIT * 0.15;
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
        idealLength: Math.min(W, H) * 0.26,
      });
    });

    const numRouters = Math.max(1, routerRows.length);
    const R2_INIT = Math.min(W, H) * 0.42;
    // Fan-out: mỗi child đặt lệch góc rõ (120° bước) để không thẳng hàng với router khi ít node
    const childAngleStep = (2 * Math.PI) / Math.max(3, childRows.length + 1);
    childRows.forEach((_, i) => {
      const parentIdx = i % numRouters;
      const parentAngle = (2 * Math.PI * parentIdx) / numRouters - Math.PI / 2;
      const angle = parentAngle + (i + 1) * childAngleStep + (seeded(i + 100) - 0.5) * 0.3;
      fnodes.push({
        id: `child-${i}`,
        x: cx + R2_INIT * Math.cos(angle) + (seeded(i + 200) - 0.5) * 30,
        y: cy + R2_INIT * Math.sin(angle) + (seeded(i + 300) - 0.5) * 30,
        vx: 0,
        vy: 0,
        fixed: false,
      });
      fedges.push({
        source: `router-${parentIdx}`,
        target: `child-${i}`,
        idealLength: Math.min(W, H) * 0.16,
      });
    });

    const positions = runForceLayout(fnodes, fedges, LAYOUT_ITERATIONS, W, H);

    const nodes: LayoutNode[] = [];
    const edges: Edge[] = [];

    const leaderPos = positions.get("leader") ?? { x: cx, y: cy };
    const leaderNode: LayoutNode = {
      id: "leader",
      kind: "leader",
      x: leaderPos.x,
      y: leaderPos.y,
      rloc16: null,
      label: "BR",
      icon: ICON_MAP.leader,
      isBr: brConnected,
    };
    nodes.push(leaderNode);

    const routerNodes: LayoutNode[] = [];
    routerRows.forEach((row, i) => {
      const rlocCell = rRlocCol >= 0 ? row[rRlocCol] : "";
      const pos = positions.get(`router-${i}`) ?? { x: cx, y: cy };
      const n: LayoutNode = {
        id: `router-${rlocCell ?? i}`,
        kind: "router",
        x: pos.x,
        y: pos.y,
        rloc16: parseRloc16(rlocCell),
        label: rlocCell ?? `R${i}`,
        icon: ICON_MAP.router,
        isBr: false,
      };
      routerNodes.push(n);
      nodes.push(n);
      edges.push({
        x1: leaderNode.x,
        y1: leaderNode.y,
        x2: pos.x,
        y2: pos.y,
        type: "router",
      });
    });

    childRows.forEach((r, i) => {
      const rlocCell = cRlocCol >= 0 ? r[cRlocCol] : "";
      const pos = positions.get(`child-${i}`) ?? { x: cx, y: cy };
      const parentIdx = i % numRouters;
      const parent = routerNodes[parentIdx];
      nodes.push({
        id: `child-${rlocCell ?? i}`,
        kind: "child",
        x: pos.x,
        y: pos.y,
        rloc16: parseRloc16(rlocCell),
        label: rlocCell ?? `C${i}`,
        icon: ICON_MAP.default,
        isBr: false,
      });
      if (parent) {
        edges.push({
          x1: parent.x,
          y1: parent.y,
          x2: pos.x,
          y2: pos.y,
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
    const { nodes, edges } = this._getLayout();
    const { w, h } = this.containerSize;
    const viewBox = `0 0 ${w} ${h}`;

    return html`
      <div
        class="topology-map"
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointerleave=${this._onPointerUp}
      >
        <svg
          class="topology-svg"
          viewBox=${viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
          <g class="topology-viewport">
            <g class="topology-edges">
              ${edges.map(
                (e) =>
                  svg`<line
                class="edge edge--${e.type}"
                x1="${e.x1}"
                y1="${e.y1}"
                x2="${e.x2}"
                y2="${e.y2}"
              />`
              )}
            </g>
            <g class="topology-nodes">
              ${nodes.map((node) => {
                const isSelected = this.selectedNodeId === node.id;
                const classes = [
                  "topology-node",
                  `topology-node--${node.kind}`,
                  node.isBr ? "topology-node--br" : "",
                  isSelected ? "topology-node--selected" : "",
                  node.offline ? "topology-node--offline" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return svg`<g
                  class="${classes}"
                  transform="translate(${node.x}, ${node.y})"
                  @click=${() => this._selectNode(node.id)}
                >
                  ${node.kind === "leader"
                    ? svg`<circle class="node__pulse" r="30" fill="none" stroke-width="1" opacity="0"/>
                      <circle class="node__pulse" r="30" fill="none" stroke-width="1" opacity="0"/>`
                    : ""}
                  ${node.isBr
                    ? svg`<circle class="node__br-ring" r="26" fill="none" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.8"/>`
                    : ""}
                  <circle class="node__body" r=${node.kind === "leader" ? 28 : 20}/>
                  <text class="node__icon" text-anchor="middle" dominant-baseline="central">${node.icon}</text>
                  <text class="node__label" dy="24" text-anchor="middle">${node.label}</text>
                </g>`;
              })}
            </g>
          </g>
        </svg>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "topology-map": TopologyMapComponent;
  }
}
