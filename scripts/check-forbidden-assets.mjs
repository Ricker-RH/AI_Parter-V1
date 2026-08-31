import {readdirSync, statSync} from 'node:fs'
import {join, relative, resolve} from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const forbidden = [
  /(?:^|\/)assets\/illustrations\//,
  /(?:^|\/)assets\/icons\/(?!flags\/)/,
  /(?:^|\/)assets\/images\//,
  /(?:^|\/)assets\/(app-icons|splash)\//,
  /(?:^|\/)assets\/(favicon|logo|default-avatar)/,
]
const hits = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else {
      const path = relative(root, full).replaceAll('\\', '/')
      if (forbidden.some(pattern => pattern.test(path))) hits.push(path)
    }
  }
}

walk(root)
if (hits.length) {
  process.stderr.write(`Forbidden upstream assets:\n${hits.join('\n')}\n`)
  process.exit(1)
}
