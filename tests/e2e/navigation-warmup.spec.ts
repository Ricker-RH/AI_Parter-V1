import {expect,test} from '@playwright/test'

const account={id:'11111111-1111-4111-8111-111111111111',kind:'human',username:'warmup_test',displayName:'Warmup Test',preferredLocale:'en',creatorModeEnabled:false}
const ip={id:'33333333-3333-4333-8333-333333333333',username:'warmup_ip',displayName:'Prepared Profile IP',shortDescription:'Prepared content',languageCodes:['en'],contentThemes:[],visualType:'anime',status:'public',operationEnabled:false,creator:{id:account.id,username:account.username,displayName:account.displayName},references:['avatar','cover','portrait','full_body','supporting_1'].map((role,index)=>({id:`55555555-5555-4555-8555-55555555555${index}`,role})),createdAt:'2026-09-01T00:00:00.000Z'}
const post={id:'22222222-2222-4222-8222-222222222222',body:'Entry feed is ready',languageCode:'en',publishedAt:'2026-09-01T00:00:00.000Z',author:{kind:'ip',id:ip.id,username:ip.username,displayName:ip.displayName,bio:ip.shortDescription,languages:['en'],visualType:'anime'},likeCount:0,commentCount:0,bookmarkCount:0,shareCount:0}

test('entry first, then shares an in-flight profile warmup with an early navigation',async({page},info)=>{
  const requests:Array<{path:string;method:string;at:number}>=[]
  const started=Date.now()
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname
    requests.push({path,method:route.request().method(),at:Date.now()-started})
    if(path==='/api/me')return route.fulfill({json:account})
    if(path==='/api/feed')return route.fulfill({json:{items:[post],nextCursor:null}})
    if(path==='/api/conversations')return route.fulfill({json:{items:[],nextCursor:null}})
    if(path==='/api/human-chat/conversations')return route.fulfill({json:{items:[],nextCursor:null}})
    if(path==='/api/creator/ips'){
      await new Promise(resolve=>setTimeout(resolve,350))
      return route.fulfill({json:{items:[ip],nextCursor:null}})
    }
    return route.fulfill({status:503,json:{code:'TEST_UNAVAILABLE'}})
  })
  await page.goto('/en')
  await expect(page.getByText('Entry feed is ready')).toBeVisible()
  const entryVisible=Date.now()-started
  if(!process.env.WARMUP_BASELINE)await expect.poll(()=>requests.filter(r=>r.path==='/api/creator/ips').length).toBe(1)
  // Deliberately navigate before the delayed profile response settles.
  const beforeClick=requests.filter(r=>r.path==='/api/creator/ips').length
  const clickAt=Date.now()
  await page.locator('a[href="/en/profile"]:visible').first().click()
  await expect(page.getByRole('link',{name:'Prepared Profile IP',exact:true})).toBeVisible()
  const contentAfterClick=Date.now()-clickAt
  console.log(JSON.stringify({baseline:Boolean(process.env.WARMUP_BASELINE),entryVisible,contentAfterClick,beforeClick,requests}))
  await info.attach('navigation-measurements',{body:JSON.stringify({baseline:Boolean(process.env.WARMUP_BASELINE),entryVisible,contentAfterClick,beforeClick,requests},null,2),contentType:'application/json'})
  if(!process.env.WARMUP_BASELINE){
    expect(beforeClick).toBe(1)
    expect(requests.filter(r=>r.path==='/api/creator/ips')).toHaveLength(1)
  }
  expect(requests.filter(r=>r.method!=='GET')).toEqual([])
})
