"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  name: string
  url: string
  icon: LucideIcon
}

interface NavBarProps {
  items: NavItem[]
  className?: string
}

export function NavBar({ items, className }: NavBarProps) {
  const pathname = usePathname()
  // Overridden by clicking a nav item or by scrolling an anchored section
  // into view; falls back to route matching once no anchored section is in
  // view. Resets naturally on a real page navigation, since each page
  // mounts its own NavBar instance.
  const [activeOverride, setActiveOverride] = useState<string | null>(null)
  // Set on click, cleared once the click's own scroll has had time to
  // settle. While true, the observer below ignores whatever section it
  // still sees as intersecting — at click time the page hasn't scrolled
  // yet, so the PREVIOUS section is technically still visible and would
  // otherwise immediately stomp the click back to where the user came
  // from (most visibly when clicking a route-only item like "Início",
  // which has no section of its own to later reassert the override).
  const suppressObserverUntilRef = useRef(0)

  useEffect(() => {
    const sections = items
      .filter((item) => item.url.includes("#"))
      .map((item) => {
        const el = document.getElementById(item.url.split("#")[1])
        return el ? { name: item.name, el } : null
      })
      .filter((section): section is { name: string; el: HTMLElement } => section !== null)

    if (sections.length === 0) return

    // The observer callback only receives entries whose intersection status
    // changed since the last call, not every observed element's current
    // state — at a section boundary the outgoing section's entry can arrive
    // alone, momentarily losing track of the incoming section. Keep a
    // cumulative ratio per section so the active tab is always picked from
    // the full picture, not just the latest batch.
    const ratios = new Map<Element, number>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0)
        }

        let visible: { name: string; el: HTMLElement } | null = null
        let bestRatio = 0
        for (const section of sections) {
          const ratio = ratios.get(section.el) ?? 0
          if (ratio > bestRatio) {
            bestRatio = ratio
            visible = section
          }
        }

        // During the post-click suppression window, skip entirely — both a
        // match and a null here would fight a just-clicked tab before its
        // own scroll has landed. Outside that window, follow the viewport
        // normally, including back to null (routed fallback) when nothing
        // is visible, e.g. scrolled back up to the unobserved hero.
        if (Date.now() < suppressObserverUntilRef.current) return
        setActiveOverride(visible?.name ?? null)
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    )

    sections.forEach((section) => observer.observe(section.el))
    return () => observer.disconnect()
  }, [items])

  // Longest-prefix match so a nested route (e.g. "/admin/agenda/2026-10-09")
  // still highlights its section tab ("/admin/agenda") instead of falling
  // through to the first item.
  const routeItem = items
    .filter((item) => !item.url.includes("#"))
    .filter((item) => pathname === item.url || pathname.startsWith(`${item.url}/`))
    .sort((a, b) => b.url.length - a.url.length)[0]
  const activeTab = activeOverride ?? routeItem?.name ?? items[0].name

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 sm:bottom-auto sm:top-20",
        className,
      )}
    >
      <div className="flex items-center gap-1 rounded-sm border border-border bg-background/80 px-1 py-1 shadow-lg backdrop-blur-lg">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.name

          return (
            <Link
              key={item.name}
              href={item.url}
              onClick={() => {
                suppressObserverUntilRef.current = Date.now() + 1000
                setActiveOverride(item.name)
              }}
              className={cn(
                "relative cursor-pointer rounded-sm px-5 py-2 text-sm font-semibold transition-colors",
                "text-foreground/70 hover:text-primary",
                isActive && "text-primary",
              )}
            >
              <span className="hidden md:inline">{item.name}</span>
              <span className="md:hidden">
                <Icon size={18} strokeWidth={2.5} />
              </span>
              {isActive && (
                <motion.div
                  layoutId="lamp"
                  layout
                  className="absolute inset-0 -z-10 w-full rounded-sm bg-primary/10"
                  initial={false}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                  }}
                >
                  {/* Nested elements need `layout` too, or the parent's
                      scale-based layout animation distorts/misplaces them
                      instead of letting them simply translate with it. */}
                  <motion.div
                    layout
                    className="absolute -top-2 inset-x-0 mx-auto h-1 w-8 rounded-t-full bg-primary"
                  >
                    <motion.div layout className="absolute -left-2 -top-2 h-6 w-12 rounded-full bg-primary/20 blur-md" />
                    <motion.div layout className="absolute -top-1 h-6 w-8 rounded-full bg-primary/20 blur-md" />
                    <motion.div layout className="absolute left-2 top-0 h-4 w-4 rounded-full bg-primary/20 blur-sm" />
                  </motion.div>
                </motion.div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
