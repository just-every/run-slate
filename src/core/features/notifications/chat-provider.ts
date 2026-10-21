import {slackNotifier} from './slack';
import {teamsNotifier} from './teams';
import {nookNotifier,type NookNotificationDoor} from './nook';
export type ChatProvider='slack'|'teams'|'nook';
export const chatNotifier=(provider:ChatProvider,door?:NookNotificationDoor)=>provider==='nook'?nookNotifier(door):provider==='teams'?teamsNotifier():slackNotifier();
