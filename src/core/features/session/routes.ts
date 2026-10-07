import { Hono } from "hono";
import { z } from "zod";
import type { AppEnvironment } from "../../app/types";
import { error } from "../../shared/errors";
import { isLoopbackHostname, safeAppPath } from "../../platform/auth/paths";
import { createSessionService } from "./service";

import { beginIdentity, finishIdentity } from './oidc';
import { readCookie } from '../../platform/auth/cookie';
import { requestMagicLink, acceptMagicLink, magicLinkStatus } from './magic-links';
import { acceptInvitation } from '../workspace/invitations';
import { parseBody } from '../workspace/routes';
const localSignInInput = z.object({ next: z.string().optional() });

export function createSessionRoutes({ seedLocalSampleData }: { seedLocalSampleData: (binding: D1Database) => Promise<boolean> }) {
  return new Hono<AppEnvironment>()
    .get("/api/auth/capabilities", (context) => {
      const config = context.get("runtimeConfig");
      const localSampleData = config.localSampleData && isLoopbackHostname(new URL(context.req.url).hostname);
      return context.json({localSession:localSampleData,mailDelivery:!!(config.mailApiKey&&config.mailFrom&&config.appUrl),identityProvider:!!config.ssoEnabled});
    })
    .get('/api/auth/identity',async c=>{const result=await beginIdentity(c.env.DB,c.get('runtimeConfig'));c.header('Set-Cookie',`slate_identity_state=${result.state}; Path=/api/auth/identity; HttpOnly; SameSite=Lax; Secure; Max-Age=600`);return c.redirect(result.url);})
    .get('/api/auth/identity/callback',async c=>{const config=c.get('runtimeConfig');const input=z.object({state:z.string().min(20).max(512),code:z.string().min(1).max(4096)}).safeParse(c.req.query());if(!input.success)return c.json(error('IDENTITY_INVALID','Invalid identity response.'),400);const session=await finishIdentity(c.env.DB,config,{...input.data,cookieState:readCookie(c.req.raw.headers,'slate_identity_state')??''});c.header('Set-Cookie',createSessionService(c.env.DB,config.sessionSecret).cookieFor(session.token,session.expiresAt,true));return c.redirect('/app');})
    .post('/api/auth/magic', async c => {const input=await parseBody(c.req,z.object({email:z.string().email().max(254),requestKey:z.string().min(32).max(160).optional()}).strict());return c.json(await requestMagicLink(c.env.DB,c.get('runtimeConfig'),input.email,input.requestKey));})
    .post('/api/auth/magic/status', async c => {const input=await parseBody(c.req,z.object({email:z.string().email().max(254),requestKey:z.string().min(32).max(160)}).strict());return c.json(await magicLinkStatus(c.env.DB,c.get('runtimeConfig'),input.email,input.requestKey));})
    .get('/api/auth/magic/accept', async c => {
      const token=z.string().min(20).max(512).safeParse(c.req.query('token'));
      if(!token.success)return c.json(error('LINK_INVALID','Invalid link.'),400);
      const config=c.get('runtimeConfig');const session=await acceptMagicLink(c.env.DB,config,token.data);
      c.header('Set-Cookie',createSessionService(c.env.DB,config.sessionSecret).cookieFor(session.token,session.expiresAt,new URL(c.req.url).protocol==='https:'));
      return c.redirect('/app');
    })
    .get('/api/auth/invitation/accept', async c => {
      const token=z.string().min(20).max(512).safeParse(c.req.query('token'));
      if(!token.success)return c.json(error('LINK_INVALID','Invalid link.'),400);
      const config=c.get('runtimeConfig');const session=await acceptInvitation(c.env.DB,config,token.data,{files:c.env.FILES,jobs:c.env.JOBS});
      c.header('Set-Cookie',createSessionService(c.env.DB,config.sessionSecret).cookieFor(session.token,session.expiresAt,new URL(c.req.url).protocol==='https:'));
      return c.redirect('/app');
    })
    .post("/api/auth/local-sign-in", async (context) => {
      const hostname = new URL(context.req.url).hostname;
      const body = await context.req.json().catch(() => null);
      const input = localSignInInput.safeParse(body);
      if (!input.success) return context.json(error("INVALID_REQUEST", "The local sign-in request is invalid."), 400);

      const config = context.get("runtimeConfig");
      const localSampleData = config.localSampleData && isLoopbackHostname(hostname);
      const service = createSessionService(context.env.DB, config.sessionSecret);
      if (localSampleData && !await seedLocalSampleData(context.env.DB)) {
        return context.json(error("LOCAL_SAMPLE_UNAVAILABLE", "Local sample sign-in only operates on an empty database or the sole Aurora sample workspace."), 409);
      }
      const session = await service.createLocalSession(localSampleData);
      if (!session) return context.json(error("NOT_FOUND", "Not found."), 404);

      const secure = new URL(context.req.url).protocol === "https:";
      context.header("Set-Cookie", service.cookieFor(session.token, session.expiresAt, secure));
      return context.json({ next: safeAppPath(input.data.next), member: session.member });
    })
    .post("/api/auth/logout", async (context) => {
      const config = context.get("runtimeConfig");
      const cookie = await createSessionService(context.env.DB, config.sessionSecret).logout(context.req.raw.headers);
      context.header("Set-Cookie", cookie);
      return context.body(null, 204);
    })
    .get("/api/session", (context) => {
      const member = context.get("member");
      if (!member) return context.json(error("UNAUTHENTICATED", "A valid session is required."), 401);
      return context.json({ member });
    });
}
