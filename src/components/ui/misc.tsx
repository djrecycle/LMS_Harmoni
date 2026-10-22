import * as React from "react";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const toneBadge = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-accent-foreground dark:text-accent",
} as const;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof toneBadge }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", toneBadge[tone], className)}
      {...props}
    />
  );
}

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

const styleAlert = {
  info: { classroom: "bg-primary-soft text-foreground", Icon: Info },
  success: { classroom: "bg-success-soft text-foreground", Icon: CircleCheck },
  error: { classroom: "bg-danger-soft text-foreground", Icon: CircleX },
  warning: { classroom: "bg-warning-soft text-foreground", Icon: TriangleAlert },
} as const;

export function Alert({
  kind = "info",
  title,
  children,
  className,
}: {
  kind?: keyof typeof styleAlert;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { classroom, Icon } = styleAlert[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg p-3.5 text-sm", classroom, className)}>
      <Icon className="mt-0.5 size-4.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5 text-muted-foreground")}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center">
      {icon && <div className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary [&_svg]:size-7">{icon}</div>}
      <h3 className="text-base font-bold">{title}</h3>
      {children && <p className="max-w-md text-sm text-muted-foreground">{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  keterangan,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  keterangan?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs">
      {icon && <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary [&_svg]:size-5">{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-2xl font-extrabold leading-tight">{value}</p>
        {keterangan && <p className="truncate text-xs text-muted-foreground">{keterangan}</p>}
      </div>
    </div>
  );
}
