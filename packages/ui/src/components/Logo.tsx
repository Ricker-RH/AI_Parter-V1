import type {SVGProps} from 'react'

export interface LogoProps extends SVGProps<SVGSVGElement> {
  showWordmark?: boolean
}

export function Logo({showWordmark = true, ...props}: LogoProps) {
  return (
    <svg
      aria-label="AIFANS"
      role="img"
      viewBox={showWordmark ? '0 0 236 64' : '0 0 64 64'}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="aifans-logo-gradient" x1="0" x2="1" y1="1" y2="0">
          <stop stopColor="#315CFF" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <path
        d="M2 59 28 9c2-3 5-5 9-5h25L51 29H38c-3 0-5 2-6 5l-2 7h29l-3 11c-1 4-4 7-9 7H38V47H27l-6 12H2Z"
        fill="url(#aifans-logo-gradient)"
      />
      <path d="M32 29h10v27H24l6-10h2V29Z" fill="var(--aifans-surface, #fff)" />
      {showWordmark ? (
        <text
          fill="currentColor"
          fontFamily="Inter, Noto Sans SC, system-ui, sans-serif"
          fontSize="28"
          fontWeight="700"
          letterSpacing="1.6"
          x="76"
          y="42"
        >
          AIFANS
        </text>
      ) : null}
    </svg>
  )
}
