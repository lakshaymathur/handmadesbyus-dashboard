/** A titled section of a detail page, ruled off from what's above it. */
export function PageSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t pt-6">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}
