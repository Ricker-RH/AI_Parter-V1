export type RateLimitPolicy='chat_send'|'comment_create'|'social_mutation'|'creator_mutation'|'admin_mutation'|'auth_attempt'
export type RateLimitDecision={allowed:boolean;remaining:number;retryAfterSeconds:number}
export type RateLimitPort={consume(input:{policy:RateLimitPolicy;identifierHash:string}):Promise<RateLimitDecision>}
