export function DraftBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '4px',
        background: 'rgba(245,158,11,0.12)',
        color: 'var(--amber)',
        letterSpacing: '0.02em',
      }}
    >
      임시저장
    </span>
  )
}
