import {expect,it} from 'vitest';
import {presenceChanges,ephemeralFresh} from './presence.js';
const identity={subject:'a',profileId:'11111111-1111-4111-8111-111111111111',sessionId:'22222222-2222-4222-8222-222222222222',sessionExpiresAt:999999};
const conversationId='33333333-3333-4333-8333-333333333333';
it('drops delayed typing and disconnected online frames instead of replaying ephemeral state',()=>{
 const typing={type:'typing',conversationId,isTyping:true} as const;
 expect(ephemeralFresh(typing,identity,1000,6001,[{identity}])).toBe(false);
 expect(ephemeralFresh(typing,identity,1000,2000,[])).toBe(false);
 expect(ephemeralFresh(typing,identity,1000,2000,[{identity}])).toBe(true);
 expect(ephemeralFresh({type:'presence',conversationId,status:'offline'},identity,1000,2000,[])).toBe(true);
});
it('announces online from actual devices, refreshes bounded leases, offline only after last device',()=>{
  const first=presenceChanges(undefined,[{identity,subscriptions:[conversationId]}],1000);
  expect(first.events).toEqual([{identity,conversationId,status:'online',snapshot:true}]);
  const second=presenceChanges(first.state,[{identity,subscriptions:[]},{identity,subscriptions:[conversationId]}],2000);
  expect(second.events).toEqual([]);
  expect(presenceChanges(second.state,[{identity,subscriptions:[]}],3000).events).toEqual([]);
  const pulse=presenceChanges(second.state,[{identity,subscriptions:[]}],31000);
  expect(pulse.events[0]?.status).toBe('online');
  const last=presenceChanges(pulse.state,[],32000);
  expect(last.events).toEqual([{identity,conversationId,status:'offline',snapshot:false}]);
  expect(last.state.conversations).toEqual({});
});
