import type {AppBindings} from '../../app/types';
import {pageTools} from './page-tools';
import {containerTools} from './container-tools';
import {readTools} from './read-tools';
import {grantTools} from './grant-tools';
export {nativeNotTools} from './not-tools';
export function nativeTools(env:AppBindings) {return [...readTools(env),...containerTools(env),...pageTools(env),...grantTools(env)];}
