import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A label, the control, and either its error or its help text underneath. Give the
 * control `id` and `aria-describedby={`${id}-note`}`.
 */
export function FormField({
  id,
  label,
  error,
  help,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
  children: React.ReactNode;
}) {
  const note = error ?? help;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {note && (
        <p
          id={`${id}-note`}
          className={cn(
            "text-sm",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}

/** A form-level message: "Saved." or an error not tied to one field. */
export function FormMessage({
  message,
}: {
  message: { ok: boolean; text: string } | null;
}) {
  if (!message) return null;
  return (
    <p
      role={message.ok ? "status" : "alert"}
      className={cn(
        "text-sm",
        message.ok ? "text-muted-foreground" : "text-destructive",
      )}
    >
      {message.text}
    </p>
  );
}
