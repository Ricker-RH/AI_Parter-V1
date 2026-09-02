export type RouteSkeletonVariant =
  | 'feed'
  | 'list'
  | 'detail'
  | 'search'
  | 'profile'
  | 'messages'
  | 'message-detail'
  | 'auth'
  | 'settings'
  | 'creator-center'
  | 'creator-draft'

const cardCounts: Record<RouteSkeletonVariant, number> = {
  feed: 3,
  list: 5,
  detail: 1,
  search: 4,
  profile: 3,
  messages: 5,
  'message-detail': 3,
  auth: 3,
  settings: 3,
  'creator-center': 3,
  'creator-draft': 5,
}

function Line({size}: {size?: 'short' | 'medium' | 'title'}) {
  return <span className={`route-skeleton-line${size ? ` route-skeleton-line--${size}` : ''}`} />
}

function Card({media = false}: {media?: boolean}) {
  return <div className="route-skeleton-card"><span className="route-skeleton-avatar"/><span className="route-skeleton-card-content"><Line size="short"/><Line/><Line size="medium"/>{media ? <span className="route-skeleton-media"/> : null}</span></div>
}

function Header({action = false}: {action?: boolean}) {
  return <div className="route-skeleton-header"><Line size="title"/>{action ? <span className="route-skeleton-action"/> : null}</div>
}

function FeedShape({detail = false}: {detail?: boolean}) {
  const count = detail ? 1 : cardCounts.feed
  return <><Header action={detail}/><div className="route-skeleton-content">{Array.from({length: count}, (_, index) => <Card key={index} media={detail || index === 0}/>)}</div></>
}

function ListShape({count = cardCounts.list}: {count?: number}) {
  return <><Header/><div className="route-skeleton-tabs"><Line/><Line/></div><div className="route-skeleton-content">{Array.from({length: count}, (_, index) => <Card key={index}/>)}</div></>
}

function SearchShape() {
  return <><Header/><div className="route-skeleton-search-box"/><div className="route-skeleton-tabs route-skeleton-tabs--three"><Line/><Line/><Line/></div><div className="route-skeleton-content">{Array.from({length: cardCounts.search}, (_, index) => <Card key={index}/>)}</div></>
}

function ProfileShape() {
  return <><Header/><div className="route-skeleton-profile"><span className="route-skeleton-profile-copy"><Line size="title"/><Line size="medium"/><Line/></span><span className="route-skeleton-profile-avatar"/><span className="route-skeleton-profile-actions"><Line/><Line/></span></div><div className="route-skeleton-tabs"><Line/></div><div className="route-skeleton-content">{Array.from({length: cardCounts.profile}, (_, index) => <Card key={index}/>)}</div></>
}

function MessagesShape() {
  return <><Header action/><div className="route-skeleton-search-box"/><div className="route-skeleton-tabs"><Line/><Line/></div><div className="route-skeleton-messages"><div className="route-skeleton-content">{Array.from({length: cardCounts.messages}, (_, index) => <Card key={index}/>)}</div><div className="route-skeleton-message-detail"><span className="route-skeleton-message-bubble"/><span className="route-skeleton-message-bubble route-skeleton-message-bubble--mine"/><span className="route-skeleton-message-compose"/></div></div></>
}

function MessageDetailShape() {
  return <div className="route-skeleton-message-detail-frame"><div className="route-skeleton-conversation-list">{Array.from({length: cardCounts['message-detail']}, (_, index) => <Card key={index}/>)}</div><div className="route-skeleton-conversation-detail"><Header action/><div className="route-skeleton-message-detail"><span className="route-skeleton-message-bubble"/><span className="route-skeleton-message-bubble route-skeleton-message-bubble--mine"/><span className="route-skeleton-message-compose"/></div></div></div>
}

function AuthShape() {
  return <div className="route-skeleton-auth-frame"><div className="route-skeleton-auth-brand"><span className="route-skeleton-brand-mark"/><Line size="title"/><Line size="medium"/></div><div className="route-skeleton-auth-form"><Line size="title"/>{Array.from({length: cardCounts.auth}, (_, index) => <div className="route-skeleton-card route-skeleton-field" key={index}><Line size="short"/><Line/></div>)}<span className="route-skeleton-submit"/></div></div>
}

function SettingsShape() {
  return <><Header/><div className="route-skeleton-content route-skeleton-settings">{Array.from({length: cardCounts.settings}, (_, index) => <div className="route-skeleton-card route-skeleton-setting" key={index}><span><Line size="short"/><Line size="medium"/></span><span className="route-skeleton-setting-control"/></div>)}</div></>
}

function CreatorCenterShape() {
  return <div className="route-skeleton-creator-center-frame"><div className="route-skeleton-creator-hero"><span><Line size="short"/><Line size="title"/><Line size="medium"/></span><span className="route-skeleton-submit"/></div><div className="route-skeleton-creator-section"><Header/>{Array.from({length: cardCounts['creator-center']}, (_, index) => <Card key={index}/>)}</div></div>
}

function CreatorDraftShape() {
  return <div className="route-skeleton-creator-draft-frame"><Header/><div className="route-skeleton-creator-form"><Line size="title"/>{Array.from({length: cardCounts['creator-draft']}, (_, index) => <div className="route-skeleton-card route-skeleton-field" key={index}><Line size="short"/><Line/></div>)}<div className="route-skeleton-reference-grid"><span/><span/><span/><span/></div><span className="route-skeleton-submit"/></div></div>
}

function Shape({variant}: {variant: RouteSkeletonVariant}) {
  if (variant === 'feed') return <FeedShape/>
  if (variant === 'detail') return <FeedShape detail/>
  if (variant === 'list') return <ListShape/>
  if (variant === 'search') return <SearchShape/>
  if (variant === 'profile') return <ProfileShape/>
  if (variant === 'messages') return <MessagesShape/>
  if (variant === 'message-detail') return <MessageDetailShape/>
  if (variant === 'auth') return <AuthShape/>
  if (variant === 'settings') return <SettingsShape/>
  if (variant === 'creator-center') return <CreatorCenterShape/>
  return <CreatorDraftShape/>
}

export function RouteSkeleton({label, variant}: {label: string; variant: RouteSkeletonVariant}) {
  return <main aria-busy="true" aria-label={label} className={`route-skeleton route-skeleton--${variant}`} data-navigation-mode="non-instant" role="status"><div aria-hidden="true" data-skeleton-shape={variant}><Shape variant={variant}/></div></main>
}
