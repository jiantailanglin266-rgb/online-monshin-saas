export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-surface border border-line p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
