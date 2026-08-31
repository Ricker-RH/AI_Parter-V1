import {headers} from 'next/headers'

export async function requestCookie(): Promise<string | undefined> {
  try {
    return (await headers()).get('cookie') ?? undefined
  } catch {
    return undefined
  }
}
