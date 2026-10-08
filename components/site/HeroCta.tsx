"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ANIMATION_MS = 500;

export function HeroCta({
  href,
  label,
  variant,
}: {
  href: string;
  label: string;
  variant: "solid" | "outline";
}) {
  const router = useRouter();
  const [isAnimating, setIsAnimating] = useState(false);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (isAnimating) {
      e.preventDefault();
      return;
    }

    // Touch devices have no hover state, so the reveal animation never
    // plays before navigation — play it on tap, then redirect.
    const isTouchDevice =
      typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
    if (!isTouchDevice) return;

    e.preventDefault();
    setIsAnimating(true);
    window.setTimeout(() => router.push(href), ANIMATION_MS);
  }

  return (
    <Button
      asChild
      className={cn(
        "group/cta relative h-12 w-fit overflow-hidden rounded-sm ps-7 pe-14 text-sm font-semibold tracking-wide transition-all duration-500 hover:ps-14 hover:pe-7",
        isAnimating && "ps-14 pe-7",
        variant === "solid"
          ? "bg-gold text-gold-ink hover:bg-gold-bright"
          : "border border-gold bg-transparent text-gold hover:bg-gold hover:text-gold-ink"
      )}
    >
      <Link href={href} onClick={handleClick}>
        <span className="relative z-10">{label}</span>
        <span
          className={cn(
            "absolute right-1 flex h-10 w-10 items-center justify-center rounded-sm transition-all duration-500 group-hover/cta:right-[calc(100%-44px)] group-hover/cta:rotate-45",
            isAnimating && "right-[calc(100%-44px)] rotate-45",
            variant === "solid" ? "bg-gold-ink text-gold" : "bg-gold text-gold-ink"
          )}
        >
          <ArrowUpRight size={16} />
        </span>
      </Link>
    </Button>
  );
}
