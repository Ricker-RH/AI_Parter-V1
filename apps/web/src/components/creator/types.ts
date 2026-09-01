import type {CreatorAnalytics,CreatorDraft,CreatorIp,CreatorRequest,CreatorSubmissionRecord} from '@aifans/contracts'

export type {CreatorAnalytics,CreatorDraft,CreatorIp,CreatorRequest,CreatorSubmissionRecord}
export interface CreatorLabels {
  eyebrow:string;title:string;description:string;newIdentity:string;emptyTitle:string;emptyDescription:string;drafts:string;identities:string;loading:string;unavailable:string;authRequired:string;signIn:string
  draftForm:string;identity:string;persona:string;username:string;displayName:string;shortDescription:string;languages:string;themes:string;personality:string;background:string;world:string;values:string;tone:string;interests:string;boundaries:string;relationshipStyle:string;appearance:string;visualType:string;realistic:string;anime:string;hybrid:string;saveDraft:string;saving:string;saveError:string;saved:string;cancel:string
  references:string;referenceCount:string;uploadReference:string;uploading:string;uploadError:string;assetsUnavailable:string;generateReferences:string;generationUnavailable:string;generationPending:string;roleAvatar:string;roleCover:string;rolePortrait:string;roleFullBody:string;roleSupporting1:string;roleSupporting2:string;roleSupporting3:string;roleSupporting4:string
  authorization:string;authorizationText:string;authorizationAccept:string;submit:string;submitting:string;submitError:string;submittedReadOnly:string;back:string
  analytics:string;followers:string;followerDelta:string;publishedPosts:string;likes:string;comments:string;popularPosts:string;analyticsPrivate:string
  requests:string;requestKind:string;requestReason:string;change:string;unpublish:string;deletion:string;sendRequest:string;requestSent:string;requestError:string
  statusDraft:string;statusSubmitted:string;statusPending:string;statusApproved:string;statusRejected:string
}
export interface CreatorAdminLabels {eyebrow:string;title:string;description:string;submissions:string;requests:string;submission:string;request:string;emptySubmissions:string;emptyRequests:string;loading:string;unavailable:string;currentIdentity:string;proposedIdentity:string;visualType:string;languages:string;shortDescription:string;themes:string;appearance:string;persona:string;personality:string;background:string;world:string;values:string;tone:string;interests:string;boundaries:string;relationshipStyle:string;approve:string;reject:string;reason:string;reasonRequired:string;updated:string;decisionError:string}
