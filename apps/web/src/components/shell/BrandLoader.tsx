import {Logo} from '@aifans/ui'

export function BrandLoader({label = 'Loading AIFANS', compact = false, decorative = false}: {label?: string; compact?: boolean; decorative?: boolean}) {
  return <span className={`brand-loader${compact ? ' brand-loader--compact' : ''}`} role={decorative ? undefined : 'status'} aria-label={decorative ? undefined : label} aria-busy={decorative ? undefined : true}>
    <span aria-hidden="true" className="brand-loader__art"><Logo showWordmark={false}/><span className="brand-loader__track"/></span>
    <span className="sr-only">{label}</span>
  </span>
}
