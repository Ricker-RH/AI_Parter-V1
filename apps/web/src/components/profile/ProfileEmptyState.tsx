import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import styles from './ProfileEmptyState.module.css'

type Collection = 'ips' | 'liked' | 'saved' | 'following' | 'posts' | 'media'
const descriptions = {
  ips: ['你创建的 IP 会展示在这里，先去发现一些灵感吧。', 'Your IP profiles will appear here. Explore and find some inspiration.'],
  liked: ['遇到喜欢的内容，点个赞就能在这里找到。', 'Give a post a like and find it here later.'],
  saved: ['收藏感兴趣的内容，留待下次慢慢看。', 'Save something interesting to come back to later.'],
  following: ['关注感兴趣的 IP，随时发现他们的新动态。', 'Follow interesting IP profiles to keep up with their posts.'],
  posts: ['新的动态会出现在这里，晚点再来看看吧。', 'New posts will appear here. Check back later.'],
  media: ['发布的图片会收集在这里。', 'Images shared in posts appear here.'],
} as const

export function ProfileEmptyState({title, kind, locale, own = false}: {title: string; kind: Collection; locale: Locale; own?: boolean}) {
  const zh = locale === 'zh-CN'
  const description = own || kind === 'posts' || kind === 'media' ? descriptions[kind][zh ? 0 : 1] : zh ? '这里暂时还没有内容，晚点再来看看吧。' : 'Nothing here yet. Check back later.'
  return <section className={styles.root} aria-label={title}>
    <svg className={styles.art} aria-hidden="true" viewBox="0 0 128 104" fill="none">
      <ellipse cx="64" cy="93" rx="36" ry="5" fill="currentColor" opacity=".05"/>
      <circle cx="64" cy="48" r="40" fill="currentColor" opacity=".04"/>
      <rect x="30" y="20" width="58" height="66" rx="12" transform="rotate(-12 30 20)" fill="var(--shell-hover)" stroke="var(--shell-border)" strokeWidth="1.5"/>
      <rect x="39" y="17" width="58" height="70" rx="12" fill="var(--shell-surface)" stroke="var(--shell-border)" strokeWidth="1.5"/>
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity=".65">
        {kind === 'liked' ? <path d="M68 59 55 46c-9-10 6-20 13-10 7-10 22 0 13 10L68 59Z"/> : kind === 'saved' ? <path d="M58 33h20v27L68 53 58 60V33Z"/> : kind === 'media' ? <><rect x="53" y="33" width="30" height="26" rx="4"/><circle cx="62" cy="41" r="2"/><path d="m54 54 8-8 6 5 6-9 8 11"/></> : kind === 'posts' ? <><path d="M55 36h26M55 44h26M55 52h17"/></> : <><circle cx="68" cy="39" r="7"/><path d="M55 60v-3a13 13 0 0 1 26 0v3"/></>}
        <path d="M56 73h24" opacity=".35"/>
        <path d="M105 24v8m-4-4h8M22 61v6m-3-3h6" opacity=".45"/>
      </g>
    </svg>
    <h2>{title}</h2>
    <p>{description}</p>
    {own ? <Link className={styles.action} href={`/${locale}/${kind === 'ips' || kind === 'following' ? 'search' : ''}`}>{zh ? '去发现' : 'Explore'}<span aria-hidden="true">→</span></Link> : null}
  </section>
}
