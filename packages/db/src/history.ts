import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {QueryClient} from './session.js'

const uuid = z.string().uuid()
const nonBlank = z.string().regex(/[^\s]/)
const sensitiveKey = /(^|_)(access_?token|email(_address)?|database_url|signed_url|private_message|post_text|comment_text|search_query|prompt|cookie|secret|token|password|body|message)(_|$)/i
const auditSummary = z.object({role: z.literal('operator')}).strict()
const correlation = {
  locale: z.enum(['en', 'zh-CN']).optional(),
  request_id: uuid.optional(),
  profile_id: uuid.optional(),
  app_version: nonBlank.optional(),
  deployment_environment: nonBlank.optional(),
}
const accountRegisteredProperties = z.object({event_id: uuid, ...correlation}).strict()
const posthogAccountRegisteredPayload = z.object({event_id: uuid, event_name: z.literal('account_registered'), event_version: z.literal(1), ...correlation}).strict()
const auditInput = z.object({actorProfileId: uuid.optional(), action: z.literal('operator_granted'), entityType: z.literal('profile'), entityId: uuid, sourceApp: z.enum(['api', 'admin', 'worker']), result: z.enum(['succeeded', 'rejected', 'failed']).optional(), actorType: z.enum(['human', 'operator', 'system']).optional(), requestId: uuid.optional(), changeSummary: auditSummary}).strict()
const businessInput = z.object({eventName: z.literal('account_registered'), actorProfileId: uuid.optional(), subjectEntityType: z.literal('profile'), subjectEntityId: uuid, environment: nonBlank, properties: accountRegisteredProperties, requestId: uuid.optional(), schemaVersion: z.literal(1).optional()}).strict()
const transitionInput = z.object({entityType: z.string().regex(/[^\s]/), entityId: uuid, nextState: z.string().regex(/[^\s]/), previousState: z.string().optional(), actorProfileId: uuid.optional(), reasonCode: z.string().optional(), operatorNote: z.string().optional(), requestId: uuid.optional()}).strict()
const outboxInput = z.object({destination: z.literal('posthog'), payloadVersion: z.literal(1), payload: posthogAccountRegisteredPayload}).strict()

type AuditInput = z.infer<typeof auditInput>
type BusinessInput = z.infer<typeof businessInput>
type TransitionInput = z.infer<typeof transitionInput>
type OutboxInput = z.infer<typeof outboxInput>

function json(value: unknown): string { return JSON.stringify(value) }

function rejectSensitiveKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) rejectSensitiveKeys(item)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (sensitiveKey.test(key)) throw new Error(`Sensitive history key: ${key}`)
      rejectSensitiveKeys(item)
    }
  }
}

export function createHistoryRepository() {
  return {
    async withAtomic<T>(client: QueryClient, callback: (client: QueryClient) => Promise<T>): Promise<T> {
      await client.query('SAVEPOINT history_atomic')
      try {
        const result = await callback(client)
        await client.query('RELEASE SAVEPOINT history_atomic')
        return result
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT history_atomic').catch(() => undefined)
        await client.query('RELEASE SAVEPOINT history_atomic').catch(() => undefined)
        throw error
      }
    },
    async recordAudit(client: QueryClient, input: AuditInput): Promise<string> {
      rejectSensitiveKeys(input)
      input = auditInput.parse(input)
      const id = randomUUID()
      await client.query(`INSERT INTO public.audit_events (id, actor_type, actor_profile_id, action, entity_type, entity_id, request_id, source_app, result, change_summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [id, input.actorType ?? (input.actorProfileId ? 'human' : 'system'), input.actorProfileId ?? null, input.action, input.entityType, input.entityId, input.requestId ?? null, input.sourceApp, input.result ?? 'succeeded', json(input.changeSummary ?? {})])
      return id
    },
    async recordBusinessEvent(client: QueryClient, input: BusinessInput): Promise<string> {
      rejectSensitiveKeys(input)
      input = businessInput.parse(input)
      const id = randomUUID()
      await client.query(`INSERT INTO public.business_events (id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`, [id, input.eventName, input.schemaVersion ?? 1, input.actorProfileId ?? null, input.subjectEntityType, input.subjectEntityId, input.requestId ?? null, input.environment, json(input.properties)])
      return id
    },
    async recordTransition(client: QueryClient, input: TransitionInput): Promise<string> {
      input = transitionInput.parse(input)
      const id = randomUUID()
      await client.query(`INSERT INTO public.workflow_transitions (id,entity_type,entity_id,previous_state,next_state,actor_profile_id,reason_code,operator_note,request_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id,input.entityType,input.entityId,input.previousState ?? null,input.nextState,input.actorProfileId ?? null,input.reasonCode ?? null,input.operatorNote ?? null,input.requestId ?? null])
      return id
    },
    async recordOutbox(client: QueryClient, businessEventId: string, input: OutboxInput): Promise<string> {
      uuid.parse(businessEventId)
      rejectSensitiveKeys(input)
      input = outboxInput.parse(input)
      const id = randomUUID()
      await client.query(`INSERT INTO public.analytics_outbox (id,business_event_id,destination,payload_version,payload) VALUES ($1,$2,$3,$4,$5::jsonb)`, [id,businessEventId,input.destination,input.payloadVersion,json(input.payload)])
      return id
    },
    async record(client: QueryClient, input: {audit: AuditInput; business: BusinessInput; transition: TransitionInput; outbox: OutboxInput}) {
      const audit_events = await this.recordAudit(client, input.audit)
      const business_events = await this.recordBusinessEvent(client, input.business)
      const workflow_transitions = await this.recordTransition(client, input.transition)
      const analytics_outbox = await this.recordOutbox(client, business_events, input.outbox)
      return {audit_events, business_events, workflow_transitions, analytics_outbox}
    },
  }
}
