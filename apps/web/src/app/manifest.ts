import type {MetadataRoute} from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {id:'/',name:'AIFANS',short_name:'AIFANS',start_url:'/',scope:'/',display:'standalone',background_color:'#ffffff',theme_color:'#ffffff',icons:[{src:'/pwa/icon-192-v2.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/pwa/icon-512-v2.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]}
}
