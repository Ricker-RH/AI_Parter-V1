import {randomUUID} from 'node:crypto'
import type {QueryClient} from './session.js'

type AuditInput = {actorProfileId?: string; action: string; entityType: string; entityId: string; sourceApp: 'api' | 'admin' | 'worker'; result?: 'succeeded' | 'rejected' | 'failed'; actorType?: 'human' | 'operator' | 'system'; requestId?: string; changeSummary?: Record<string, unknown>}
type BusinessInput = {eventName: string; actorProfileId?: string; subjectEntityType: string; subjectEntityId: string; environment: string; properties: Record<string, string | number | boolean | null>; requestId?: string; schemaVersion?: number}
type TransitionInput = {entityType: string; entityId: string; nextState: string; previousState?: string; actorProfileId?: string; reasonCode?: string; operatorNote?: string; requestId?: string}
type OutboxInput = {destination: string; payloadVersion: number; payload: Record<string, string | number | boolean | null>}

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
      const id = randomUUID()
      await client.query(`INSERT INTO public.audit_events (id, actor_type, actor_profile_id, action, entity_type, entity_id, request_id, source_app, result, change_summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [id, input.actorType ?? (input.actorProfileId ? 'human' : 'system'), input.actorProfileId ?? null, input.action, input.entityType, input.entityId, input.requestId ?? null, input.sourceApp, input.result ?? 'succeeded', json(input.changeSummary ?? {})])
      return id
    },
    async recordBusinessEvent(client: QueryClient, input: BusinessInput): Promise<string> {
      const id = randomUUID()
      await client.query(`INSERT INTO public.business_events (id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`, [id, input.eventName, input.schemaVersion ?? 1, input.actorProfileId ?? null, input.subjectEntityType, input.subjectEntityId, input.requestId ?? null, input.environment, json(input.properties)])
      return id
    },
    async recordTransition(client: QueryClient, input: TransitionInput): Promise<string> {
      const id = randomUUID()
      await client.query(`INSERT INTO public.workflow_transitions (id,entity_type,entity_id,previous_state,next_state,actor_profile_id,reason_code,operator_note,request_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id,input.entityType,input.entityId,input.previousState ?? null,input.nextState,input.actorProfileId ?? null,input.reasonCode ?? null,input.operatorNote ?? null,input.requestId ?? null])
      return id
    },
    async recordOutbox(client: QueryClient, businessEventId: string, input: OutboxInput): Promise<string> {
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
