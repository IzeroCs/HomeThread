/**
 * Persist BR topology snapshot: device_topology + device_topology_neighbor for the Border Router.
 * Called from CommunicateManager after fetchRouterTable + fetchChildTable in pullAllOnReconnect.
 */

import type { RouterEntry, ChildEntry } from "@communicate/frame";
import { getBrDeviceId, upsertTopology, type TopologyNeighborItem } from "@database/repositories/device.repository";
import { DEVICE_ROLE } from "./thread-role";

/** Map firmware role byte (CMD_STATE) to topology role: 0=child, 1=router, 2=leader (payload spec). */
function topologyRoleFromRoleByte(roleByte: number): number | null {
  switch (roleByte) {
    case DEVICE_ROLE.LEADER:
      return 2;
    case DEVICE_ROLE.ROUTER:
      return 1;
    case DEVICE_ROLE.CHILD:
      return 0;
    default:
      return null;
  }
}

/**
 * Build neighbor list from Router Table (is_child=0) and Child Table (is_child=1).
 * rssi/lq_in/lq_out left null per plan. neighborRloc16 stored as number.
 */
function buildNeighbors(routerEntries: RouterEntry[], childEntries: ChildEntry[]): TopologyNeighborItem[] {
  const neighbors: TopologyNeighborItem[] = [];
  for (const e of routerEntries) {
    neighbors.push({ neighborRloc16: e.rloc16, isChild: false });
  }
  for (const e of childEntries) {
    neighbors.push({ neighborRloc16: e.rloc16, isChild: true });
  }
  return neighbors;
}

export type PersistBrTopologyParams = {
  routerEntries: RouterEntry[];
  childEntries: ChildEntry[];
  /** BR rloc16 as number (e.g. from otConfig.leaderRloc16 parsed, or heuristic from Router Table). */
  brRloc16OrNull: number | null;
  /** Firmware role byte from CMD_STATE (DEVICE_ROLE). */
  roleByte: number;
};

/**
 * Persist BR device_topology and device_topology_neighbor.
 * No-op if getBrDeviceId() returns null (BR device_info not yet created).
 */
export function persistBrTopology(params: PersistBrTopologyParams): void {
  const { routerEntries, childEntries, brRloc16OrNull, roleByte } = params;
  const brDeviceId = getBrDeviceId();
  if (brDeviceId == null) return;

  const role = topologyRoleFromRoleByte(roleByte);
  const neighbors = buildNeighbors(routerEntries, childEntries);

  upsertTopology({
    deviceId: brDeviceId,
    rloc16: brRloc16OrNull,
    parentRloc16: null,
    role,
    rssi: null,
    linkQuality: null,
    neighbors,
  });
}
