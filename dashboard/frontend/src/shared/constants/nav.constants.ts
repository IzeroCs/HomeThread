import type { NavPage } from "@/shared/types/nav.type";

export interface NavItem {
  page: NavPage;
  label: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_ITEMS: NavGroup[] = [
{
  label: "sidebar.group.monitor",
  items: [
    { page: "monitor-status", label: "sidebar.item.status", icon: "speed" },
    { page: "monitor-nodes", label: "sidebar.item.nodes", icon: "account_tree" },
    { page: "monitor-joiner", label: "sidebar.item.joiner", icon: "group_add" },
    { page: "monitor-topology", label: "sidebar.item.topology", icon: "hub" },
  ],
},
{
  label: "sidebar.group.settings",
  items: [
    { page: "settings-connection", label: "sidebar.item.settingsConnection", icon: "lan" },
    { page: "settings-thread", label: "sidebar.item.settingsThread", icon: "device_hub" },
    { page: "settings-device", label: "sidebar.item.settingsDevice", icon: "warning" },
  ],
},
];
