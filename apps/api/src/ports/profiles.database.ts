import {ensureHumanProfile, getCurrentAccount, updateCurrentAccount} from '@aifans/db'
import type {ProfilePort} from './profiles.js'

export const databaseProfilePort: ProfilePort = {
  ensureHumanProfile,
  getCurrentAccount,
  updateCurrentAccount,
}
