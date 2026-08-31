export class CreatorClientError extends Error {constructor(readonly status:number){super(`creator:${status}`)}}
export async function creatorJson<T>(path:string,init?:RequestInit):Promise<T>{
  let response:Response
  try{response=await fetch(`/api/creator/${path}`,init)}catch{throw new CreatorClientError(503)}
  if(!response.ok)throw new CreatorClientError(response.status)
  try{return await response.json() as T}catch{throw new CreatorClientError(502)}
}
export function jsonInit(method:'POST'|'PATCH',body:unknown):RequestInit{return{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)}}
