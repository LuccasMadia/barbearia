import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function BackToHomeLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 text-sm text-paper-dim transition-colors hover:text-gold",
        className,
      )}
    >
      <ArrowLeft size={16} strokeWidth={2} />
      Início
    </Link>
  );
}
