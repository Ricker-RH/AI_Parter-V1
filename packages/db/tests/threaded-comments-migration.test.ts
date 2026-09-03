import {randomUUID} from 'node:crypto'
import {copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Pool} from 'pg'
import {describe, expect, it} from 'vitest'
import {migrate} from '../src/migrate.js'

const connectionString=process.env.DATABASE_URL??''
const describeIntegration=connectionString?describe:describe.skip
const migrationDirectory=new URL('../migrations/',import.meta.url)
const targetMigration='202609030003_threaded_comment_interactions.sql'
const sql=readFileSync(new URL(targetMigration,migrationDirectory),'utf8')

async function cleanupUpgradeResources(
  dropDatabase:()=>Promise<void>,
  closeAdminPool:()=>Promise<void>,
  removeStagedMigrations:()=>void,
):Promise<void>{
  try {
    await dropDatabase()
  }finally{
    try {
      await closeAdminPool()
    }finally{
      removeStagedMigrations()
    }
  }
}

describe('threaded comment migration',()=>{
  it('backfills immutable same-post root identity before enforcing it',()=>{
    expect(sql).toMatch(/WITH RECURSIVE roots/)
    expect(sql).toMatch(/comments_root_comment_fk[\s\S]*FOREIGN KEY\(root_comment_id,post_id\)/)
    expect(sql).toMatch(/comments_parent_same_post_fk[\s\S]*FOREIGN KEY\(parent_comment_id,post_id\)/)
    expect(sql).toMatch(/comments_root_shape_check/)
    expect(sql).toMatch(/OLD\.root_comment_id IS DISTINCT FROM NEW\.root_comment_id/)
  })

  it('has an explicit total fanout and root-page bound',()=>{
    expect(sql).toMatch(/count\(\*\)>500/)
    expect(sql).toMatch(/count\(\*\)[\s\S]*>=500/)
    expect(sql).toMatch(/LEAST\(GREATEST\(COALESCE\(root_limit,1\),1\),51\)/)
  })

  it('keeps the legacy read projection while exposing only bounded mutation functions',()=>{
    expect(sql).not.toMatch(/DROP FUNCTION public\.social_public_comments/)
    expect(sql).toMatch(/REVOKE INSERT,DELETE ON public\.comment_likes/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.like_comment/)
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.require_public_comment/)
  })

  it('propagates database cleanup failures after releasing the remaining resources',async()=>{
    const calls:string[]=[]
    const dropError=new Error('drop failed')

    await expect(cleanupUpgradeResources(
      async()=>{calls.push('drop');throw dropError},
      async()=>{calls.push('close')},
      ()=>{calls.push('remove')},
    )).rejects.toBe(dropError)
    expect(calls).toEqual(['drop','close','remove'])
  })
})

describeIntegration('threaded comment migration upgrade',()=>{
  it('backfills root identities for existing roots and replies',async()=>{
    const databaseName=`aifans_threaded_upgrade_${randomUUID().replaceAll('-','')}`
    const stagedMigrations=mkdtempSync(join(tmpdir(),'aifans-threaded-upgrade-'))
    const adminPool=new Pool({connectionString})
    const upgradeUrl=new URL(connectionString)
    upgradeUrl.pathname=`/${databaseName}`

    try {
      await adminPool.query(`CREATE DATABASE ${databaseName}`)
      for(const name of readdirSync(migrationDirectory).filter(name=>name.endsWith('.sql')&&name<targetMigration)){
        copyFileSync(new URL(name,migrationDirectory),join(stagedMigrations,name))
      }
      await migrate({connectionString:upgradeUrl.toString(),directory:stagedMigrations})

      const fixturePool=new Pool({connectionString:upgradeUrl.toString()})
      const humanId=randomUUID()
      const ipId=randomUUID()
      const revisionId=randomUUID()
      const postId=randomUUID()
      const rootId=randomUUID()
      const replyId=randomUUID()
      try {
        await fixturePool.query(
          `INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name)
           VALUES($1,$2,'human',$3,'Upgrade human'),($4,NULL,'ip',$5,'Upgrade IP')`,
          [humanId,`auth-${humanId}`,`human_${humanId.replaceAll('-','').slice(0,20)}`,ipId,`ip_${ipId.replaceAll('-','').slice(0,20)}`],
        )
        await fixturePool.query(
          `INSERT INTO public.ip_profiles(profile_id,source,operation_enabled)
           VALUES($1,'platform',true)`,
          [ipId],
        )
        await fixturePool.query(
          `INSERT INTO public.ip_identity_revisions(id,ip_profile_id,version,display_name)
           VALUES($1,$2,1,'Upgrade IP')`,
          [revisionId,ipId],
        )
        await fixturePool.query(
          `UPDATE public.ip_profiles
           SET current_identity_revision_id=$1,public_state='published'
           WHERE profile_id=$2`,
          [revisionId,ipId],
        )
        await fixturePool.query(
          `INSERT INTO public.posts(id,author_profile_id,state,source,body,published_at)
           VALUES($1,$2,'published','worker','Upgrade post',clock_timestamp())`,
          [postId,ipId],
        )
        await fixturePool.query(
          `INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body)
           VALUES($1,$2,NULL,$3,'human','Existing root'),($4,$2,$1,$3,'human','Existing reply')`,
          [rootId,postId,humanId,replyId],
        )
      }finally{
        await fixturePool.end()
      }

      copyFileSync(new URL(targetMigration,migrationDirectory),join(stagedMigrations,targetMigration))
      await expect(migrate({connectionString:upgradeUrl.toString(),directory:stagedMigrations})).resolves.toEqual([targetMigration])

      const verifiedPool=new Pool({connectionString:upgradeUrl.toString()})
      try {
        await expect(verifiedPool.query(
          'SELECT id,root_comment_id FROM public.comments WHERE id=ANY($1::uuid[]) ORDER BY id',
          [[rootId,replyId]],
        )).resolves.toMatchObject({rows:expect.arrayContaining([
          {id:rootId,root_comment_id:rootId},
          {id:replyId,root_comment_id:rootId},
        ])})
      }finally{
        await verifiedPool.end()
      }
    }finally{
      await cleanupUpgradeResources(
        async()=>{await adminPool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)},
        ()=>adminPool.end(),
        ()=>rmSync(stagedMigrations,{recursive:true,force:true}),
      )
    }
  },30_000)
})
