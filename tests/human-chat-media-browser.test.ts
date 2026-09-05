import {readFileSync} from 'node:fs'
import {chromium, webkit} from '@playwright/test'
import {describe, expect, it} from 'vitest'

const suite = process.env.HUMAN_MEDIA_BROWSER_TEST === '1' ? describe : describe.skip
suite('human chat native media layout and playback', () => {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]] as const) {
    it(`${name} keeps both voice controls usable across viewport sizes and plays received audio`, async () => {
      const browser = await engine.launch()
      try {
        const page = await browser.newPage()
        const css = readFileSync('apps/web/src/components/chat/MessagesWorkspace.module.css', 'utf8')
        for (const width of [390, 900, 1440]) {
          await page.setViewportSize({width, height: 900})
          await page.setContent(`<style>${css}</style><div style="width:${Math.min(width - 32, 700)}px"><ol class="messageList">${['humanMessage', 'assistantMessage'].map(className => `<li class="${className}"><div class="mediaBubble"><audio controls preload="none"></audio></div></li>`).join('')}</ol></div>`)
          const sizes = await page.locator('audio').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width))
          expect(sizes.every(size => size >= 250 && size <= 300)).toBe(true)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        }
        // Transfer actual recorded bytes to another page, rather than replaying
        // the recorder's local preview URL. No microphone or user media is used.
        const recording = await page.evaluate(async () => {
          const mime = ['audio/webm;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))!
          const context = new AudioContext()
          const output = context.createMediaStreamDestination()
          const oscillator = context.createOscillator()
          oscillator.connect(output)
          oscillator.start()
          await context.resume()
          const recorder = new MediaRecorder(output.stream, {mimeType: mime})
          const chunks: Blob[] = []
          const stopped = new Promise<Blob>(resolve => {
            recorder.ondataavailable = event => chunks.push(event.data)
            recorder.onstop = () => resolve(new Blob(chunks, {type: mime}))
          })
          recorder.start()
          await new Promise(resolve => setTimeout(resolve, 400))
          recorder.stop()
          const bytes = Array.from(new Uint8Array(await (await stopped).arrayBuffer()))
          oscillator.stop()
          output.stream.getTracks().forEach(track => track.stop())
          await context.close()
          return {mime, bytes}
        })
        const recipient = await browser.newPage()
        await recipient.setContent('<audio controls></audio>')
        await recipient.evaluate(async ({mime, bytes}) => {
          const audio = document.querySelector('audio')!
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type: mime}))
          audio.src = url
          await audio.play()
        }, recording)
        await recipient.waitForFunction(() => document.querySelector('audio')!.currentTime > 0, undefined, {timeout: 5000})
        expect(await recipient.locator('audio').evaluate(audio => audio.error)).toBeNull()
      } finally { await browser.close() }
    }, 20_000)
  }
})
