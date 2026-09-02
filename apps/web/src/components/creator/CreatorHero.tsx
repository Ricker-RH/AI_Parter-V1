import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import type {CreatorLabels} from './types'

type CreatorHeroLabels=Pick<CreatorLabels,'cancel'|'description'|'eyebrow'|'newIdentity'|'title'>

export function CreatorHero({labels,locale,onNewIdentity}:{labels:CreatorHeroLabels;locale:Locale;onNewIdentity?:()=>void}){
  return <header className="creator-hero"><p>{labels.eyebrow}</p><div><h1>{labels.title}</h1><div className="creator-hero-actions"><Link className="creator-exit" href={`/${locale}/profile`}>{labels.cancel}</Link>{onNewIdentity?<button onClick={onNewIdentity} type="button">{labels.newIdentity}</button>:null}</div></div><p>{labels.description}</p></header>
}
