import { type ReactNode, useEffect, useRef } from "react";
import type { Shift } from "../lib/settlement";
import { IconChevronLeft } from "./icons";

export function ShiftBadge({ shift, size = "md" }: { shift: Shift; size?: "sm" | "md" | "lg" }) {
  if (shift === "OFF") {
    return (
      <span className={`shift-off shift-${size}`} aria-label="휴무">
        휴
      </span>
    );
  }
  return (
    <span className={`shift-badge shift-${size} shift-${shift.toLowerCase()}`} aria-label={`${shift} 근무`}>
      {shift}
    </span>
  );
}

export function TopBar({ title, onBack, backLabel = "뒤로" }: { title?: string; onBack?: () => void; backLabel?: string }) {
  return (
    <header className="topbar">
      {onBack ? (
        <button type="button" className="icon-button" onClick={onBack} aria-label={backLabel}>
          <IconChevronLeft />
        </button>
      ) : (
        <span className="icon-button-spacer" />
      )}
      {title ? <h1 className="topbar-title">{title}</h1> : null}
      <span className="icon-button-spacer" />
    </header>
  );
}

export function BottomSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-layer">
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <h2 className="sheet-title">{title}</h2>
          {subtitle ? <p className="sheet-subtitle">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role="progressbar" aria-label={label ?? "진행 중"} />;
}
