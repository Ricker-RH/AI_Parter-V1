import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import {CreatorHeader} from './CreatorHeader'
import styles from './CreatorPortal.module.css'

export function CreatorPortal({locale,returnTo}:{locale:Locale;returnTo?:string}) {
  const zh=locale==='zh-CN'
  return <main className={styles.portal}>
    <CreatorHeader locale={locale} title={zh?'创作者中心':'Creator center'} back={returnTo??`/${locale}/profile`}/>
    <section className={styles.showcase} aria-label={zh?'创作展示区':'Creative showcase'}>
      <div className={styles.copy}>
        <h2>{zh?'让想象，成为你的作品。':'Bring your imagination to life.'}</h2>
        <p>{zh?'创造角色，或从一张图开始。':'Create a character, or start with an image.'}</p>
        <div className={styles.actions}>
          <Link href={`/${locale}/creator/studio`}>{zh?'马上开始':'Get started'} <span aria-hidden="true">→</span></Link>
          <Link href={`/${locale}/creator/images`}>{zh?'生图':'Generate images'} <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </section>
  </main>
}
