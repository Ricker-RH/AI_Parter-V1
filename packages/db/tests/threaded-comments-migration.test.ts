import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

const sql=readFileSync(new URL('../migrations/202609030003_threaded_comment_interactions.sql',import.meta.url),'utf8')

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
})
