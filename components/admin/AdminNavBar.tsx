"use client";

import { LayoutDashboard, CalendarDays, ListOrdered, Settings } from "lucide-react";
import { NavBar } from "@/components/ui/tubelight-navbar";

const NAV_ITEMS = [
  { name: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { name: "Agenda", url: "/admin/agenda", icon: CalendarDays },
  { name: "Fila", url: "/admin/fila", icon: ListOrdered },
  { name: "Configurações", url: "/admin/configuracoes", icon: Settings },
];

export function AdminNavBar() {
  return <NavBar items={NAV_ITEMS} />;
}
