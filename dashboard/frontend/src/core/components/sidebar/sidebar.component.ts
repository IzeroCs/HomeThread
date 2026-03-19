import { customElement } from "lit/decorators.js";
import type { NavPage } from "@/shared/types/nav.type";
import { createLocaleController } from "@/core/i18n/locale-controller";
import { t } from "@/core/i18n/i18n";
import { NmxSidebar, type NmxSidebarNavGroup } from "@namorix/core/components";

interface NavItem {
  page: NavPage;
  label: string;
  icon: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_ITEMS: NavGroup[] = [
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

@customElement("sidebar-nav")
export class SidebarComponent extends NmxSidebar {
  override currentPage: NavPage = "monitor-status";

  private readonly locale = createLocaleController(this);

  render() {
    void this.locale.value;
    const navGroups: NmxSidebarNavGroup[] = NAV_ITEMS.map((group) => ({
      label: t(group.label),
      items: group.items.map((item) => ({
        page: item.page,
        label: t(item.label),
        icon: item.icon,
      })),
    }));

    this.navGroups = navGroups;
    this.brand = t("sidebar.brand");

    return super.render();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sidebar-nav": SidebarComponent;
  }
}
