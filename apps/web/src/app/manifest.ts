import type {MetadataRoute} from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {id:'/',name:'AIFANS',short_name:'AIFANS',start_url:'/',scope:'/',display:'standalone',background_color:'#ffffff',theme_color:'#ffffff',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]}
}
