import type {ShellLabels} from './AppNav'

export function RightRail({labels}: {labels: ShellLabels}) {
  return <aside className="right-rail" data-priority="secondary"><div className="rail-sticky"><section className="rail-card" aria-labelledby="recommendations-title"><h2 id="recommendations-title">{labels.recommendations}</h2><p className="rail-empty">{labels.recommendationsEmpty}</p></section></div></aside>
}
