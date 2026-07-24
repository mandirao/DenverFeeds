import type React from "react";
import { cn } from "@/lib/utils";

/** Shared control height + base field styling so buttons and fields always match.
 * Ported from event-form-redesign's components/event-form/primitives.tsx —
 * same tokens (bg-field/text-field-foreground/border-field-border), same
 * border/radius treatment (border-2, rounded-none). */
export const controlBase =
  "h-11 rounded-none border-2 border-field-border bg-field px-3 text-sm text-field-foreground placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring transition-shadow";

export function FieldLabel({
  children,
  required,
  htmlFor,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 flex items-baseline gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-card-foreground"
    >
      <span>
        {children}
        {required && <span className="ml-0.5 text-muted-foreground">*</span>}
      </span>
      {hint && <span className="font-medium normal-case tracking-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Field({
  label,
  required,
  hint,
  htmlFor,
  className,
  highlight,
  children,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  htmlFor?: string;
  className?: string;
  /** Briefly rings the field when the AI just filled it. */
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-none transition-shadow duration-500",
        highlight && "ring-2 ring-accent ring-offset-4 ring-offset-card",
        className,
      )}
    >
      {label && (
        <FieldLabel required={required} htmlFor={htmlFor} hint={hint}>
          {label}
        </FieldLabel>
      )}
      {children}
    </div>
  );
}

export function TextField({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, "w-full", className)} {...props} />;
}

export function TextArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-none border-2 border-field-border bg-field px-3 py-2.5 text-sm leading-relaxed text-field-foreground placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
        className,
      )}
      {...props}
    />
  );
}

/** Native <select> variant — used where a bare select is simpler than the
 * Radix-based @/components/ui/select (e.g. simple option lists with no need
 * for search/virtualization). */
export function SelectField({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        controlBase,
        "w-full appearance-none bg-[length:1rem] bg-[right_0.6rem_center] bg-no-repeat pr-8",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23333%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]",
        className,
      )}
      {...props}
    />
  );
}
