import {requestHash} from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import {providerJson} from './http';
import type {Adapter,RemoteDocument} from './types';
export interface Issue {title:string;body:string|null;updated_at:string;state:string;number:number}
export async function githubRevision(issue:Issue){return `${issue.updated_at}:${await requestHash({title:issue.title,body:issue.body,state:issue.state})}`;}
export class GithubAdapter implements Adapter {
 constructor(private token:string){}
 async identity(){const u=await providerJson<{id:number;login:string}>('https://api.github.com/user',this.token);return {accountId:u.login,principalId:String(u.id),label:u.login};}
 private async issue(id:string){if(!/^[\w.-]+\/[\w.-]+\/\d+$/.test(id))throw new ApiProblem(400,'INVALID_SOURCE_ID','Use owner/repository/issue-number.');const [owner,repo,number]=id.split('/');return providerJson<Issue>(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`,this.token);}
 async checkPublic(id:string){await this.issue(id);const [owner,repo]=id.split('/');const result=await providerJson<{private:boolean}>(`https://api.github.com/repos/${owner}/${repo}`,this.token);return result.private===false;}
 async check(id:string){const [issue,identity]=await Promise.all([this.issue(id),this.identity()]);return {revision:await githubRevision(issue),...identity};}
 async read(id:string):Promise<RemoteDocument>{const issue=await this.issue(id),identity=await this.identity();return {remoteId:id,revision:await githubRevision(issue),title:issue.title,text:`State: ${issue.state}\n${issue.body??''}`,acl:{accountId:identity.accountId,principalId:identity.principalId},observedAt:new Date().toISOString()};}
}
