import {createSocialRepository} from '@aifans/db'
import type {SocialPort} from './social.js'

export const databaseSocialPort: SocialPort = createSocialRepository()
