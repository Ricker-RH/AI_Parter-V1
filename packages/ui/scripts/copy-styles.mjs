import {cpSync, mkdirSync} from 'node:fs'
import {dirname, resolve} from 'node:path'

const source = resolve('src/styles/tokens.css')
const destination = resolve('dist/styles/tokens.css')

mkdirSync(dirname(destination), {recursive: true})
cpSync(source, destination)
