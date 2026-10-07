import type { FeatureContext } from '../../app/feature-context';
import type { NotificationEvent } from './events';
export interface NotificationContext extends FeatureContext {sourceSecret?:string}
export interface NotificationDetail {requesterMemberId?:string;runId?:string;decisionId?:string;inquiryId?:string;experimentId?:string;outcome?:string;sourcePageIds?:string[]}
export type NotificationVisibility=(ctx:NotificationContext,detail:NotificationDetail)=>Promise<boolean>;
const resolvers=new Map<NotificationEvent,NotificationVisibility>();
export function registerNotificationVisibility(event:NotificationEvent,resolver:NotificationVisibility){resolvers.set(event,resolver);}
export async function permittedNotificationEvidence(ctx:NotificationContext,event:NotificationEvent|undefined,detail:NotificationDetail):Promise<boolean>{const governed=!!(detail.runId||detail.decisionId||detail.inquiryId||detail.experimentId);if(!governed)return true;const resolver=event?resolvers.get(event):undefined;return resolver?resolver(ctx,detail):false;}
