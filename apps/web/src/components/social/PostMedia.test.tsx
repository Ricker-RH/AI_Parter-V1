import {fireEvent, render, screen, within} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import type {PublicPostMedia} from '@aifans/contracts'
import {describe, expect, it, vi} from 'vitest'
import {PostMedia} from './PostMedia.js'

vi.mock('next/link', () => ({default: ({children, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>}))

const media: PublicPostMedia[] = [
  {id: '33333333-3333-4333-8333-333333333333', type: 'image', url: 'https://media.example/wide.webp', altText: 'Wide moon', width: 1200, height: 800, aspectRatio: null},
  {id: '44444444-4444-4444-8444-444444444444', type: 'image', url: 'https://media.example/tall.webp', altText: null, width: null, height: null, aspectRatio: 0.75},
]

describe('PostMedia', () => {
  it('keeps every image at one responsive height while preserving its own width ratio', () => {
    render(<PostMedia authorName="Luma" items={media} label="Post media" postHref="/en/posts/post-id"/>)

    const rail = screen.getByRole('region', {name: 'Post media'})
    expect(rail).toHaveAttribute('data-layout', 'rail')
    const frames = within(rail).getAllByTestId('post-media-frame')
    expect(frames.map((frame) => frame.style.getPropertyValue('--post-media-ratio'))).toEqual(['1.5', '0.75'])
    expect(frames.every((frame) => frame.tagName === 'A' && frame.getAttribute('href') === '/en/posts/post-id')).toBe(true)
    expect(screen.getByRole('img', {name: 'Wide moon'})).toHaveAttribute('width', '1200')
    expect(screen.getByRole('img', {name: 'Luma 2/2'})).not.toHaveAttribute('width')
  })

  it('keeps a single image intrinsic-width instead of stretching it across the post', () => {
    render(<PostMedia authorName="Luma" items={media.slice(0, 1)} label="Post media"/>)

    const rail = screen.getByRole('region', {name: 'Post media'})
    expect(rail).toHaveAttribute('data-layout', 'single')
    expect(within(rail).getByTestId('post-media-frame').style.getPropertyValue('--post-media-ratio')).toBe('1.5')
    expect(within(rail).queryByRole('link')).toBeNull()
  })

  it('supports snap-rail keyboard movement without exposing a scrollbar control', () => {
    render(<PostMedia authorName="Luma" items={media} label="Post media"/>)
    const rail = screen.getByRole('region', {name: 'Post media'})
    const scrollBy = vi.fn()
    Object.defineProperties(rail, {clientWidth: {configurable: true, value: 400}, scrollBy: {configurable: true, value: scrollBy}})

    fireEvent.keyDown(rail, {key: 'ArrowRight'})
    fireEvent.keyDown(rail, {key: 'ArrowLeft'})

    expect(scrollBy).toHaveBeenNthCalledWith(1, {behavior: 'smooth', left: 328})
    expect(scrollBy).toHaveBeenNthCalledWith(2, {behavior: 'smooth', left: -328})
  })

  it('defines a transparent, uncropped, scrollbar-free responsive rail', () => {
    const stylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/PostMedia.module.css' : 'apps/web/src/components/social/PostMedia.module.css', 'utf8')
    expect(stylesheet).toMatch(/\.rail\s*\{[^}]*--post-media-height:\s*clamp\(/s)
    expect(stylesheet).toMatch(/scroll-snap-type:\s*x mandatory/)
    expect(stylesheet).toMatch(/scrollbar-width:\s*none/)
    expect(stylesheet).toMatch(/\.rail::-webkit-scrollbar\s*\{[^}]*display:\s*none/)
    expect(stylesheet).toMatch(/\.frame\s*\{[^}]*aspect-ratio:\s*var\(--post-media-ratio\)[^}]*flex:\s*0 0 auto/s)
    expect(stylesheet).toMatch(/\.image\s*\{[^}]*object-fit:\s*contain/s)
    expect(stylesheet).not.toMatch(/background(?:-color)?:/)
  })
})
