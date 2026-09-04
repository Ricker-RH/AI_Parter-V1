import {describe,it,expect,vi} from 'vitest'
import {createHumanChatMediaPort} from './human-chat-media.js'
describe('human media orchestration',()=>{
 it('authorizes before signing and confirms only server-verified output',async()=>{
  const reservation={attachmentId:'id',attachment:null},verified={contentType:'image/webp',sizeBytes:5,width:1,height:1},attachment={attachmentId:'id',kind:'image',...verified}
  const repository={reserve:vi.fn(async()=>reservation),get:vi.fn(async()=>reservation),confirm:vi.fn(async()=>({...reservation,attachment}))}
  const storage={createUpload:vi.fn(async()=>({url:'private'})),finalize:vi.fn(async()=>verified),download:vi.fn(async()=>({url:'signed'}))}
  const port=createHumanChatMediaPort({repository,storage} as never),actor={subject:'owner'}
  expect(await port.finalize(actor,'id')).toEqual(attachment)
  expect(repository.confirm).toHaveBeenCalledWith(actor,'id',verified)
  repository.get.mockRejectedValueOnce(new Error('denied'))
  await expect(port.download(actor,'id')).rejects.toThrow('denied')
  expect(storage.download).not.toHaveBeenCalled()
 })
 it('does not confirm rejected bytes and retries finalized attachments without rereading staging',async()=>{
  const attachment={attachmentId:'id',kind:'voice',contentType:'audio/webm',sizeBytes:5}
  const repository={get:vi.fn(async()=>({attachment})),confirm:vi.fn()},storage={finalize:vi.fn()}
  const port=createHumanChatMediaPort({repository,storage} as never)
  expect(await port.finalize({subject:'owner'},'id')).toEqual(attachment)
  expect(storage.finalize).not.toHaveBeenCalled();expect(repository.confirm).not.toHaveBeenCalled()
  repository.get.mockResolvedValueOnce({attachment:null} as never);storage.finalize.mockRejectedValueOnce(new Error('HUMAN_MEDIA_INVALID'))
  await expect(port.finalize({subject:'owner'},'id')).rejects.toThrow('HUMAN_MEDIA_INVALID')
  expect(repository.confirm).not.toHaveBeenCalled()
 })
})
