import { slackNotifier } from './slack';
import { teamsNotifier } from './teams';
export type ChatProvider='slack'|'teams';
export const chatNotifier=(provider:ChatProvider)=>provider==='teams'?teamsNotifier():slackNotifier();
