'use client'

import type {PublicPostMedia} from '@aifans/contracts'
import Link from 'next/link'
import type {CSSProperties, KeyboardEvent} from 'react'
import styles from './PostMedia.module.css'

type MediaFrameStyle = CSSProperties & {'--post-media-ratio': string}

function positive(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function geometry(item: PublicPostMedia) {
  const width = item.width
  const height = item.height
  if (positive(width) && positive(height)) return {height, ratio: width / height, width}
  return {height: undefined, ratio: positive(item.aspectRatio) ? item.aspectRatio : 4 / 5, width: undefined}
}

export function PostMedia({authorName, items, label, onPostOpen, postHref}: {
  authorName: string
  items: PublicPostMedia[]
  label: string
  onPostOpen?: () => void
  postHref?: string
}) {
  if (!items.length) return null

  function moveRail(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.currentTarget.scrollBy({
      behavior: 'smooth',
      left: (event.key === 'ArrowRight' ? 1 : -1) * Math.max(event.currentTarget.clientWidth * 0.82, 240),
    })
  }

  return <div
    aria-label={label}
    className={`${styles.rail ?? ''} post-media-rail`}
    data-count={items.length}
    data-layout={items.length === 1 ? 'single' : 'rail'}
    data-testid="post-media-rail"
    onKeyDown={moveRail}
    role="region"
    {...(items.length > 1 ? {tabIndex: 0} : {})}
  >
    {items.map((item, index) => {
      const dimensions = geometry(item)
      const image = <img
        alt={item.altText ?? `${authorName} ${index + 1}/${items.length}`}
        className={styles.image}
        height={dimensions.height}
        loading="lazy"
        src={item.url}
        width={dimensions.width}
      />
      const frameProps = {
        className: `${styles.frame ?? ''} post-media-frame`,
        'data-testid': 'post-media-frame',
        style: {'--post-media-ratio': String(dimensions.ratio)} as MediaFrameStyle,
      }
      return postHref
        ? <Link {...frameProps} href={postHref} key={item.id} {...(onPostOpen ? {onClick: onPostOpen} : {})}>{image}</Link>
        : <div {...frameProps} key={item.id}>{image}</div>
    })}
  </div>
}
