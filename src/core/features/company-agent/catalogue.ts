import {groupTools} from './group-tools';
import {evidenceTools} from './evidence-tools';
import {discussionTools} from './discussion-tools';
import {curationTools} from './curation-tools';
import {personalTools} from './personal-tools';
import {knowledgeReadTools} from './knowledge-read-tools';
import type {AppBindings} from '../../app/types';
import {pageTools} from './page-tools';
import {containerTools} from './container-tools';
import {readTools} from './read-tools';
import {grantTools} from './grant-tools';
export {nativeNotTools} from './not-tools';
export function nativeTools(env:AppBindings) {return [...readTools(env),...containerTools(env),...pageTools(env),...grantTools(env),...knowledgeReadTools(env),...personalTools(env),...discussionTools(env),...curationTools(env),...evidenceTools(env),...groupTools(env)];}
