import type { ReactNode } from "react";

export type Tone = "green" | "amber" | "red" | "blue";

export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`status status-${tone}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="glass card kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${tone ? ` kpi-value-${tone}` : ""}`}>{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export function SectionHeading({ title, right, sub }: { title: string; right?: ReactNode; sub?: string }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {sub ? <small>{sub}</small> : right ? <small>{right}</small> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="glass empty" role="status">
      <div className="empty-title">{title}</div>
      <div>{body}</div>
    </div>
  );
}

export function UnavailableBanner({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="banner banner-amber" role="status" aria-live="polite">
      <span aria-hidden="true">⚠</span>
      <div>
        <strong>{title}</strong>
        <div>{body}</div>
      </div>
    </div>
  );
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="banner banner-blue" role="note">
      <span aria-hidden="true">i</span>
      <div>{children}</div>
    </div>
  );
}

export function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`glass card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Panel({ children, title, right }: { children: ReactNode; title?: string; right?: ReactNode }) {
  return (
    <div className="glass panel">
      {title && (
        <div className="card-title">
          <h2>{title}</h2>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function ValueTag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}