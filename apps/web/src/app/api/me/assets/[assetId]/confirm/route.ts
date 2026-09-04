import {proxyProfileAssetPost} from '../../proxy'

type Context = {params: Promise<{assetId: string}>}

export async function POST(request: Request, context: Context): Promise<Response> {
  const {assetId} = await context.params
  return proxyProfileAssetPost(request, {kind: 'confirm', assetId})
}
