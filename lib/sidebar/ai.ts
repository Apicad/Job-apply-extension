import { browser } from 'wxt/browser';
import type { Request } from '../hackathon/contracts';
import { record } from '../hackathon/contracts';

export const AI_HOST = 'com.jobapply.ai';
export interface AIStatus { connected: boolean; message: string; provider?: 'Codex' | 'Claude Code' }
const SETUP = 'Connect your AI tool once from the sidebar settings. Your saved profile still works without AI.';

function nativeRequest(type: 'status' | 'draft', request?: Request, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Error('AI request cancelled.')); return; }
    let port: ReturnType<typeof browser.runtime.connectNative> | undefined; let done = false;
    const id = crypto.randomUUID();
    const finish = (error?: Error, data?: unknown) => {
      if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      port?.disconnect(); error ? reject(error) : resolve(data);
    };
    const abort = () => finish(Error('AI request cancelled.'));
    const timer = setTimeout(() => finish(Error('AI took too long. Your basic fields remain filled.')), type === 'status' ? 15_000 : 75_000);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const runtime = browser.runtime;
      port = runtime.connectNative(AI_HOST);
      port.onDisconnect.addListener(() => {
        const reason = runtime.lastError?.message;
        finish(Error(reason ? `AI connection failed: ${reason.slice(0, 400)} ${SETUP}` : SETUP));
      });
      port.onMessage.addListener((message: unknown) => {
        if (!record(message) || message.id !== id || typeof message.ok !== 'boolean') { finish(Error('Unexpected reply from the AI helper.')); return; }
        if (!message.ok) { finish(Error(typeof message.error === 'string' ? message.error.slice(0, 600) : 'Connected AI failed.')); return; }
        finish(undefined, message.data);
      });
      port.postMessage({ id, type, ...(request ? { request } : {}) });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 400) : 'Native messaging is unavailable.';
      finish(Error(`AI connection could not start: ${reason} ${SETUP}`));
    }
  });
}

export async function checkAI(): Promise<AIStatus> {
  try {
    const value = await nativeRequest('status');
    if (!record(value) || value.connected !== true || !['Codex', 'Claude Code'].includes(String(value.provider)) || typeof value.message !== 'string') throw Error('The AI helper returned an invalid status.');
    return { connected: true, provider: value.provider as 'Codex' | 'Claude Code', message: value.message.slice(0, 600) };
  } catch (error) { return { connected: false, message: error instanceof Error ? error.message : SETUP }; }
}

export async function draftWithAI(request: Request, signal?: AbortSignal): Promise<string> {
  const value = await nativeRequest('draft', request, signal);
  if (!record(value) || typeof value.raw !== 'string' || value.raw.length > 30_000) throw Error('The AI helper returned an invalid answer.');
  return value.raw;
}
