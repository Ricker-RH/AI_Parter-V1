export type ShellKind = 'public' | 'auth' | 'messages' | 'creator' | 'admin'

export function isActiveChatRoute(pathname: string, humanConversation: string | null): boolean {
  const match = /^\/(?:en|zh-CN)\/messages(?:\/([^/]+))?\/?$/.exec(pathname)
  if (!match) return false
  const id = match[1] ?? humanConversation
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export function resolveShellKind(pathname: string): ShellKind {
  const path = pathname.split(/[?#]/, 1)[0] ?? pathname
  const match = /^\/(en|zh-CN)(?=\/|$)(.*)$/.exec(path)
  if (!match) return 'public'
  const rest = match[2] || ''
  if (rest === '/admin' || rest.startsWith('/admin/')) return 'admin'
  if (rest === '/creator' || rest.startsWith('/creator/')) return 'creator'
  if (rest === '/messages' || rest.startsWith('/messages/') || rest === '/notifications') return 'messages'
  if (rest === '/auth' || rest.startsWith('/auth/')) return 'auth'
  return 'public'
}

export function shouldShowFloatingCreatorAction(pathname: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0] ?? pathname
  return /^\/(?:en|zh-CN)(?:\/(?:channels|messages))?\/?$/.test(path)
}

export function shouldSuppressPublicMobileTopBar(pathname: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0] ?? pathname
  return /^\/(?:en|zh-CN)\/channels(?:\/|$)/.test(path)
    || /^\/(?:en|zh-CN)\/(?:posts|profiles|humans)\/[^/]+\/?$/.test(path)
    || /^\/(?:en|zh-CN)\/profile\/?$/.test(path)
    || shouldSuppressPublicMobileNav(pathname)
}

export function shouldSuppressPublicMobileNav(pathname: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0] ?? pathname
  return /^\/(?:en|zh-CN)\/profile\/edit\/?$/.test(path)
}
