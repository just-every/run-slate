import {createServerFn} from '@tanstack/react-start';
import { notFound } from '@tanstack/react-router';
import type { DocsView } from './types';

const loadAgentDocs=createServerFn({method:'GET'}).handler(async()=>{const {agentDocs}=await import('../company-agent/docs');return agentDocs();});

/** A /docs page ("" is the docs home) with the navigation it sits in; an unknown slug is the site's branded 404. */
export async function loadDocsPage(slug: string): Promise<DocsView> {
  // Imported on every load rather than once, so in `vite dev` the Worker reads the Markdown as it is now without reloading.
  const { pages, problem, repository, sections, version } = await import('virtual:slate-docs');
  // Only in `vite dev`: a broken link or page problem fails the docs routes with its message, and no other route.
  if (problem) throw new Error(problem);
  if(slug==='agents')return {page:await loadAgentDocs(),repository,version,sections:[...sections,{title:'Company agents',pages:[{slug:'agents',label:'Agent access',href:'/docs/agents',source:'docs/agent-access.md'}]}]};
  const load = Object.hasOwn(pages, slug) ? pages[slug] : undefined;
  if (!load) throw notFound();
  return { page: (await load()).default, repository, sections, version };
}
