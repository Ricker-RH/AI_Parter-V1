import type {ChannelRepository,PlatformChannelRepository} from '@aifans/db'
import type {ChannelPort,PlatformChannelPort} from './channels.js'
export const databaseChannelPort=(repository:ChannelRepository):ChannelPort=>repository
export const databasePlatformChannelPort=(repository:PlatformChannelRepository):PlatformChannelPort=>repository
