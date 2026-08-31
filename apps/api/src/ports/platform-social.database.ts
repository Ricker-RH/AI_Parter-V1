import {createPlatformSocialRepository} from '@aifans/db'
import type {PlatformSocialPort} from './platform-social.js'

// Repository construction is environment-safe; its restricted platform pool is
// created only when a command is invoked.
export const databasePlatformSocialPort: PlatformSocialPort = createPlatformSocialRepository()
