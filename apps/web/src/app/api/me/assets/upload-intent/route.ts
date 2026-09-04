import {proxyProfileAssetPost} from '../proxy'

export function POST(request: Request): Promise<Response> {
  return proxyProfileAssetPost(request, {kind: 'intent'})
}
