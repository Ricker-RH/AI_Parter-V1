import type {Identity,EphemeralInput} from './session.js';
export function ephemeralFresh(input:EphemeralInput,identity:Identity,createdAt:number,now:number,sessions:{identity:Identity}[]) {
  if(now-createdAt>(input.type==='typing'?5000:30000)) return false;
  if((input.type==='typing'&&input.isTyping)||(input.type==='presence'&&input.status==='online')) return sessions.some(session=>session.identity.sessionId===identity.sessionId);
  return true;
}
export type PresenceState={conversations:Record<string,{identity:Identity;sentAt:number}>};
/** Stored per-profile, not per device. No online state exists without a live authenticated socket. */
export function presenceChanges(previous:PresenceState|undefined,sessions:{identity:Identity;subscriptions:string[]}[],now:number) {
  const state:PresenceState=structuredClone(previous??{conversations:{}});
  const events:{identity:Identity;conversationId:string;status:'online'|'offline';snapshot:boolean}[]=[];
  if(!sessions.length) {
    for(const [conversationId,value] of Object.entries(state.conversations)) events.push({identity:value.identity,conversationId,status:'offline',snapshot:false});
    state.conversations={}; return {state,events};
  }
  for(const session of sessions) for(const conversationId of session.subscriptions) {
    if(!state.conversations[conversationId] && Object.keys(state.conversations).length<32) {
      state.conversations[conversationId]={identity:session.identity,sentAt:now};
      events.push({identity:session.identity,conversationId,status:'online',snapshot:true});
    }
  }
  const identity=sessions.reduce((a,b)=>a.identity.sessionExpiresAt>b.identity.sessionExpiresAt?a:b).identity;
  for(const [conversationId,value] of Object.entries(state.conversations)) {
    value.identity=identity;
    if(now-value.sentAt>=30000) {value.sentAt=now;events.push({identity,conversationId,status:'online',snapshot:true})}
  }
  return {state,events};
}
