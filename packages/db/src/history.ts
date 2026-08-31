import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {QueryClient} from './session.js'

const sensitiveKey = /^(email|token|password|body|prompt|message)$/i
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const safeObject = z.record(z.string(), scalar).superRefine((value, context) => {
  for (const key of Object.keys(value)) if (sensitiveKey.test(key)) context.addIssue({code: 'custom', message: `Sensitive history property: ${key}`})
})
const uuid = z.string().uuid()
const auditInput = z.object({actorProfileId: uuid.optional(), action: z.enum(['operator_granted']), entityType: z.enum(['profile']), entityId: uuid, sourceApp: z.enum(['api', 'admin', 'worker']), result: z.enum(['succeeded', 'rejected', 'failed']).optional(), actorType: z.enum(['human', 'operator', 'system']).optional(), requestId: uuid.optional(), changeSummary: safeObject.optional()}).strict()
const businessInput = z.object({eventName: z.enum(['account_registered', 'onboarding_completed', 'creator_mode_enabled', 'ip_draft_created', 'ip_generation_completed', 'ip_generation_failed', 'ip_submission_completed', 'ip_approved', 'ip_published', 'follow_created', 'comment_created', 'conversation_started', 'ai_reply_completed', 'ai_reply_failed']), actorProfileId: uuid.optional(), subjectEntityType: z.enum(['profile', 'ip', 'post', 'comment', 'conversation', 'ai_job']), subjectEntityId: uuid, environment: z.string().regex(/[^\s]/), properties: safeObject, requestId: uuid.optional(), schemaVersion: z.literal(1).optional()}).strict()
const transitionInput = z.object({entityType: z.string().regex(/[^\s]/), entityId: uuid, nextState: z.string().regex(/[^\s]/), previousState: z.string().optional(), actorProfileId: uuid.optional(), reasonCode: z.string().optional(), operatorNote: z.string().optional(), requestId: uuid.optional()}).strict()
const outboxInput = z.object({destination: z.literal('posthog'), payloadVersion: z.literal(1), payload: safeObject}).strict()

type AuditInput = z.infer<typeof auditInput>
type BusinessInput = z.infer<typeof businessInput>
type TransitionInput = z.infer<typeof transitionInput>
type OutboxInput = z.infer<typeof outboxInput>

function json(value: unknown): string { return JSON.stringify(value) }

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
      input = auditInput.parse(input)
      const id = randomUUID()
      await client.query(`INSERT INTO public.audit_events (id, actor_type, actor_profile_id, action, entity_type, entity_id, request_id, source_app, result, change_summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [id, input.actorType ?? (input.actorProfileId ? 'human' : 'system'), input.actorProfileId ?? null, input.action, input.entityType, input.entityId, input.requestId ?? null, input.sourceApp, input.result ?? 'succeeded', json(input.changeSummary ?? {})])
      return id
    },
    async recordBusinessEvent(client: QueryClient, input: BusinessInput): Promise<string> {
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
