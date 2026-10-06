export function ScissorsMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="7" cy="8" r="3.4" />
      <circle cx="7" cy="24" r="3.4" />
      <path d="M9.6 10.2 25 21.5" />
      <path d="M9.6 21.8 25 10.5" />
      <path d="M25 21.5h3.2" />
      <path d="M25 10.5h3.2" />
    </svg>
  );
}
