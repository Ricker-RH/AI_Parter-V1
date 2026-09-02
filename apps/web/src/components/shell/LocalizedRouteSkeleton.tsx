'use client'

import {usePathname} from 'next/navigation'
import {RouteSkeleton, type RouteSkeletonVariant} from './RouteSkeleton'

export function LocalizedRouteSkeleton({variant}: {variant: RouteSkeletonVariant}) {
  const pathname = usePathname()
  const label = pathname.startsWith('/zh-CN') ? '正在加载 AIFANS' : 'Loading AIFANS'
  return <RouteSkeleton label={label} variant={variant}/>
}
