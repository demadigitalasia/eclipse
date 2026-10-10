import { useId } from 'react'

export default function EclipseMark({ large = false }: { large?: boolean }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg className={`eclipse-mark${large ? ' eclipse-mark--lg' : ''}`} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id={`c${gid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--eclipse-disc)" />
          <stop offset="52%" stopColor="var(--eclipse-disc)" />
          <stop offset="56%" stopColor="var(--accent)" />
          <stop offset="66%" stopColor="var(--corona)" stopOpacity="0.9" />
          <stop offset="80%" stopColor="var(--corona)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--corona)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`s${gid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent-secondary)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--accent-secondary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill={`url(#c${gid})`} />
      <circle cx="60" cy="60" r="56" fill={`url(#s${gid})`} opacity="0.35" />
      <circle cx="60" cy="60" r="30" fill="var(--eclipse-disc)" stroke="var(--accent)" strokeWidth="1.6" />
      <circle cx="60" cy="60" r="42" fill="none" stroke="var(--corona-ring)" strokeWidth="1" strokeDasharray="3 7" opacity="0.7" />
      <circle cx="86" cy="34" r="3" fill="var(--accent-secondary)" />
    </svg>
  )
}
