import type {HumanProfileTabKey,HumanProfileTabPage} from '@aifans/contracts'
import type {Actor} from '@aifans/db'
export type HumanProfileTabsPort={getTab(input:{viewer:Actor|null;profileId:string;tab:HumanProfileTabKey;limit:number;cursor?:string}):Promise<HumanProfileTabPage|null>}
