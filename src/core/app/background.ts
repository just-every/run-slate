import { recheckSamlDomains } from '../features/session/saml/domain';
import {scheduledBackups} from '../features/backups/scheduled';
import { readLaunchProfile, isFlagshipJob } from "../platform/config/launch-profile";
import {jobEnabled} from '../features/feature-switches/gate';
import { ApiProblem } from "./problems";
import { scheduleIdentityMail } from '../features/session/mail';
import { readRuntimeConfig } from '../platform/config/runtime';
import { handleAutomationJob, scheduledAutomation } from '../features/automation/events';
import { consumeFederationJob, scheduleSourceRefreshes } from '../features/source-memory/worker';
import type { AppBindings } from './types';
import { consumeIntelligenceJob,scheduleIntelligence } from '../features/runs/worker';
import { handleDiscoveryJob,scheduledDiscovery } from '../features/notifications/jobs';
import { runContentJobs } from '../features/lifecycle/jobs';
import { runVerificationRules } from '../features/page-status/rules/run';
/** Native retries retain one visible failure row; unrecognised jobs never become success. */
export async function consumeJobs(batch:MessageBatch<unknown>,env:AppBindings){
  for(const message of batch.messages){
    try {
      if (isFlagshipJob(message.body) && !await jobEnabled(env, message.body)) {
        throw new ApiProblem(403, 'FEATURE_DISABLED', 'This job is unavailable.');
      }
      const handled=(!!message.body&&typeof message.body==='object'&&'kind' in message.body&&message.body.kind==='core.health')||await consumeIntelligenceJob(env,message.body)||await handleDiscoveryJob(env,message.body)||await handleAutomationJob(env,message.body)||await consumeFederationJob(env,message.body);
      if(!handled)throw new Error('UNSUPPORTED_JOB');
      await env.DB.prepare("UPDATE core_job_failures SET state='recovered',updated_at=? WHERE id=?").bind(new Date().toISOString(),message.id).run();
      message.ack();
    } catch (cause) {
      await env.DB.prepare("INSERT INTO core_job_failures (id,kind,attempts,state,error_code,updated_at) VALUES (?,?,?,'failed',?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,state=excluded.state,error_code=excluded.error_code,updated_at=excluded.updated_at").bind(message.id,typeof message.body==='object'&&message.body!==null?'domain-job':'invalid-job',message.attempts,cause instanceof ApiProblem?cause.code:'JOB_DISPATCH_FAILED',new Date().toISOString()).run();
      message.retry({delaySeconds:Math.min(300,2**message.attempts)});
    }
  }
}
export async function scheduledJobs(env:AppBindings,now=new Date().toISOString()){
  const flagship = readLaunchProfile(env.SLATE_PROFILE) === 'flagship';
  const tasks: [string, () => Promise<unknown>][] = [
    ['saml-domains', () => recheckSamlDomains(env.DB)],
    ['content', () => runContentJobs(env)],
    ['backups', () => scheduledBackups(env,now)],
    // STAT-007: nightly verification rules, in every profile.
    ['verification-rules', () => runVerificationRules(env)],
    ['discovery', () => scheduledDiscovery(env)],
    ['automation', () => scheduledAutomation(env)],
    // A cron event comes from the runtime itself, not a remote request; the loopback
    // APP_URL requirement for LOCAL_DEVELOPMENT still applies.
    ['identity-mail', () => scheduleIdentityMail(env.DB,readRuntimeConfig(env,true),{files:env.FILES,jobs:env.JOBS})],
  ];
  if (flagship) tasks.push(['intelligence', () => scheduleIntelligence(env)], ['federation', () => scheduleSourceRefreshes(env)]);
  const outcomes = await Promise.allSettled(tasks.map(([, run]) => Promise.resolve().then(run)));
  const names = tasks.map(([name]) => name);
  let failed=false;
  for(let i=0;i<outcomes.length;i++)if(outcomes[i]!.status==='fulfilled'){await env.DB.prepare("UPDATE core_job_failures SET state='recovered',updated_at=? WHERE id=?").bind(new Date().toISOString(),`schedule:${names[i]}`).run();}else{failed=true;await env.DB.prepare("INSERT INTO core_job_failures (id,kind,attempts,state,error_code,updated_at) VALUES (?, ?,1,'failed','SCHEDULE_FAILED',?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1,state='failed',updated_at=excluded.updated_at").bind(`schedule:${names[i]}`,names[i]!,new Date().toISOString()).run();}
  await env.DB.prepare('DELETE FROM request_limits WHERE expires_at<=?').bind(new Date().toISOString()).run();
  if(failed)throw new Error('One or more scheduled domain jobs failed; see owner job status.');
  // Owner job status also shows when the whole schedule last ran without a failure.
  await env.DB.prepare("INSERT INTO core_job_failures (id,kind,attempts,state,error_code,updated_at) VALUES ('schedule:last-run','schedule',0,'succeeded','',?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at").bind(new Date().toISOString()).run();
}
