"use client";

import { Home, Scissors, Users, ListOrdered, Phone } from "lucide-react";
import { NavBar } from "@/components/ui/tubelight-navbar";

const NAV_ITEMS = [
  { name: "Início", url: "/", icon: Home },
  { name: "Serviços", url: "/#servicos", icon: Scissors },
  { name: "Barbeiros", url: "/#barbeiros", icon: Users },
  { name: "Fila", url: "/fila", icon: ListOrdered },
  { name: "Contato", url: "/#contato", icon: Phone },
];

export function SiteNavBar() {
  return <NavBar items={NAV_ITEMS} />;
}
