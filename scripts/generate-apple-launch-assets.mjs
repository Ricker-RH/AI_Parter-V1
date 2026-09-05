import {readFile, mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'

const require=createRequire(new URL('../apps/api/package.json',import.meta.url))
const sharp=require('sharp')
const sizes=JSON.parse(await readFile(new URL('../apps/web/src/lib/apple-launch-sizes.json',import.meta.url),'utf8'))
const icon=await readFile(new URL('../apps/web/src/app/icon.svg',import.meta.url),'utf8')
const output=new URL('../apps/web/public/pwa/',import.meta.url)
await mkdir(output,{recursive:true})
function svg(width,height,mark,theme) {
  const background=theme==='dark'?'#080808':'#ffffff'
  const foreground=theme==='dark'?'#ffffff':'#111111'
  const content=icon.replace(/<svg[^>]*>|<\/svg>/g,'').replace(/<rect[^>]*\/>/g,'').replace(/#111|#fff/g,color=>color==='#111'?foreground:background)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${background}"/><svg x="${(width-mark)/2}" y="${(height-mark)/2}" width="${mark}" height="${mark}" viewBox="0 0 64 64">${content}</svg></svg>`
}
for(const [width,height,scale] of sizes) for(const orientation of ['portrait','landscape']) for(const theme of ['light','dark']) {
  const [w,h]=orientation==='portrait'?[width*scale,height*scale]:[height*scale,width*scale]
  await sharp(Buffer.from(svg(w,h,112*scale,theme))).png().toFile(fileURLToPath(new URL(`launch-${width}-${height}-${scale}-${orientation}-${theme}-v2.png`,output)))
}
for(const size of [180,192,512]) await sharp(Buffer.from(svg(size,size,Math.round(size*.66),'light'))).png().toFile(fileURLToPath(new URL(`icon-${size}-v2.png`,output)))
console.log(`Generated ${sizes.length*4} launch images and 3 monochrome icons`)
