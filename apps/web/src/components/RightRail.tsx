import {EmptyState} from '@aifans/ui'
import type {ShellLabels} from './AppNav'

export function RightRail({labels}: {labels: ShellLabels}) {
  return <aside className="right-rail"><div className="rail-sticky"><section className="rail-card" aria-labelledby="recommendations-title"><h2 id="recommendations-title">{labels.recommendations}</h2><div className="empty"><EmptyState title={labels.recommendationsEmpty} /></div></section></div></aside>
}
