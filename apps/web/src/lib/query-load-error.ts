export class QueryLoadError extends Error {
  constructor(readonly status:'auth-required'|'unavailable') {
    super(status)
    this.name='QueryLoadError'
  }
}

export function rethrowQueryLoadError(error:unknown,signal?:AbortSignal):never {
  if(signal?.aborted)throw signal.reason??error
  if(error instanceof QueryLoadError||(typeof error==='object'&&error!==null&&'name' in error&&error.name==='AbortError'))throw error
  throw new QueryLoadError('unavailable')
}
