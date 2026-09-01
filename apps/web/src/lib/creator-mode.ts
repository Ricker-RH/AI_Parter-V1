export function isCreatorModeEnabled():boolean {
  return process.env.CREATOR_MODE_ENABLED!=='false'
}
