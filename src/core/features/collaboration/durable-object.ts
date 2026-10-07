import { readLaunchProfile } from "../../platform/config/launch-profile";
import type { AppBindings } from '../../app/types';
import type { FeatureContext } from '../../app/feature-context';
import { createSessionService } from '../session/service';
import { requirePageLevel } from '../sharing/current-access';
import { updateBlock } from '../editor/service';
import { collaborationSnapshot, updatePresence, refreshPresence } from './service';
import { ApiProblem } from '../../app/problems';
interface Attachment {
    cookie: string;
    pageId: string;
    sessionId: string;
    lastRevision: string | null;
}
/** One room per page. Durable D1 commits remain authoritative; sockets carry proposals and committed snapshots. */
export class ContentCollaboration {
    private accessTimer: ReturnType<typeof setInterval> | undefined;
    private checking = false;
    private startAccessChecks() { if (this.accessTimer)
        return; this.accessTimer = setInterval(() => { if (this.checking)
        return; const sockets = this.state.getWebSockets().filter(s => s.readyState === WebSocket.OPEN); if (!sockets.length) {
        clearInterval(this.accessTimer);
        this.accessTimer = undefined;
        return;
    } this.checking = true; this.state.waitUntil(Promise.all(sockets.map(async (socket) => { try {
        await this.context(socket.deserializeAttachment() as Attachment);
    }
    catch {
        socket.close(1008, 'Access ended');
        await this.removePresence(socket);
    } })).finally(() => { this.checking = false; })); }, 1000); }
    constructor(private state: DurableObjectState, private env: AppBindings) { }
    private async context(a: Attachment): Promise<FeatureContext> {
        if (readLaunchProfile(this.env.SLATE_PROFILE) !== 'flagship')
            throw new ApiProblem(403, 'FEATURE_DISABLED', 'Live co-editing is unavailable in the core-wiki profile.');
        const member = await createSessionService(this.env.DB, this.env.SESSION_SECRET!).authenticate(new Headers({ cookie: a.cookie }));
        if (!member)
            throw new ApiProblem(401, 'UNAUTHENTICATED', 'Session ended.');
        const ctx = { db: this.env.DB, files: this.env.FILES, jobs: this.env.JOBS, actor: member, now: new Date().toISOString() };
        await requirePageLevel(ctx, a.pageId, 'view');
        return ctx;
    }
    async fetch(request: Request) {
        if (request.method === 'POST' && new URL(request.url).pathname === '/invalidate') {
            for (const socket of this.state.getWebSockets())
                await this.sendSnapshot(socket);
            return new Response(null, { status: 204 });
        }
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
            return new Response('WebSocket upgrade required', { status: 426 });
        const u = new URL(request.url);
        if (request.headers.get('origin') && request.headers.get('origin') !== u.origin)
            return new Response('Cross-origin collaboration denied', { status: 403 });
        const a: Attachment = { cookie: request.headers.get('cookie') ?? '', pageId: u.searchParams.get('pageId') ?? '', sessionId: crypto.randomUUID(), lastRevision: null };
        try {
            const ctx = await this.context(a);
            const pair = new WebSocketPair();
            this.state.acceptWebSocket(pair[1]);
            this.startAccessChecks();
            pair[1].serializeAttachment(a);
            await updatePresence(ctx, a.pageId, a.sessionId, null);
            await this.sendSnapshot(pair[1]);
            await this.state.storage.setAlarm(Date.now() + 2000);
            return new Response(null, { status: 101, webSocket: pair[0] });
        }
        catch (e) {
            return new Response(e instanceof Error ? e.message : 'Access denied', { status: e instanceof ApiProblem ? e.status : 500 });
        }
    }
    private async sendSnapshot(socket: WebSocket) {
        const a = socket.deserializeAttachment() as Attachment;
        try {
            const ctx = await this.context(a);
            await refreshPresence(ctx, a.pageId, a.sessionId);
            const data = await collaborationSnapshot(ctx, a.pageId);
            socket.send(JSON.stringify({ type: 'snapshot', ...data }));
            a.lastRevision = data.document.workingRevisionId;
            socket.serializeAttachment(a);
        }
        catch {
            socket.close(1008, 'Access ended');
            await this.removePresence(socket);
        }
    }
    async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
        const a = socket.deserializeAttachment() as Attachment;
        try {
            if (typeof message !== 'string' || message.length > 1048576)
                throw new ApiProblem(400, 'INVALID_MESSAGE', 'Invalid collaboration message.');
            const input = JSON.parse(message), ctx = await this.context(a);
            if (input.type === 'edit') {
                const result = await updateBlock(ctx, a.pageId, input.blockId, { operationKey: input.operationKey, expectedRevisionId: input.expectedRevisionId, content: input.content });
                socket.send(JSON.stringify({ type: 'committed', ...result }));
                for (const peer of this.state.getWebSockets())
                    await this.sendSnapshot(peer);
            }
            else if (input.type === 'presence') {
                await updatePresence(ctx, a.pageId, a.sessionId, input.cursor);
                for (const peer of this.state.getWebSockets())
                    await this.sendSnapshot(peer);
            }
            else if (input.type === 'refresh')
                await this.sendSnapshot(socket);
            else
                throw new ApiProblem(400, 'UNKNOWN_MESSAGE', 'Unknown collaboration message.');
        }
        catch (e) {
            socket.send(JSON.stringify({ type: 'error', code: e instanceof ApiProblem ? e.code : 'COLLABORATION_FAILED', message: e instanceof Error ? e.message : 'Collaboration failed', details: e instanceof ApiProblem ? e.details : undefined }));
        }
    }
    async alarm() {
        this.startAccessChecks();
        for (const socket of this.state.getWebSockets())
            await this.sendSnapshot(socket);
        if (this.state.getWebSockets().length)
            await this.state.storage.setAlarm(Date.now() + 2000);
    }
    private async removePresence(socket: WebSocket) {
        const a = socket.deserializeAttachment() as Attachment;
        await this.env.DB.prepare('DELETE FROM content_presence WHERE page_id=? AND session_id=?').bind(a.pageId, a.sessionId).run();
    }
    async webSocketClose(socket: WebSocket, code = 1000, reason = '') {
        // Hibernating sockets require an explicit close response to finish the peer handshake.
        socket.close(code === 1005 || code === 1006 || code === 1015 ? 1000 : code, reason);
        await this.removePresence(socket);
    }
    async webSocketError(socket: WebSocket) { socket.close(1011, 'Collaboration connection failed'); await this.removePresence(socket); }
}
