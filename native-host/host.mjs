import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
import { decoder, encodeMessage, validateMessage, MAX_MATERIALS_REPLY_BYTES } from './protocol.mjs';
import { checkAccount, generate } from './runner.mjs';

export async function serve({ input = process.stdin, output = process.stdout, origin, config, account = checkAccount, draft = generate } = {}) {
  if (!/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin ?? '') || origin !== config?.origin || !isAbsolute(config?.executable ?? '') || (config.provider !== undefined && !['codex', 'claude'].includes(config.provider))) throw Error('Unauthorized extension origin or invalid helper installation.');
  let active = false; let dead = false; const controller = new AbortController();
  const write = (value, maxBytes) => { if (!dead) output.write(encodeMessage(value, maxBytes)); };
  const onMessage = async raw => {
    if (active) { write({ id: typeof raw?.id === 'string' ? raw.id.slice(0, 100) : '', ok: false, error: 'An AI request is already running.' }); return; }
    let message;
    try { message = validateMessage(raw); } catch (error) { write({ id: typeof raw?.id === 'string' ? raw.id.slice(0, 100) : '', ok: false, error: error.message }); return; }
    active = true;
    try {
      const options = { signal: controller.signal, provider: config.provider ?? 'claude' };
      const data = message.type === 'status' ? { ...await account(config.executable, options), helperVersion: 3, capabilities: ['draft','materials','general-materials'] } : { raw: await draft(config.executable, message.request, options) };
      write({ id: message.id, ok: true, data }, message.type === 'materials' ? MAX_MATERIALS_REPLY_BYTES : undefined);
    } catch (error) { write({ id: message.id, ok: false, error: error instanceof Error ? error.message : 'AI request failed.' }); }
    finally { active = false; }
  };
  const decode = decoder(raw => { void onMessage(raw); });
  const stop = () => { dead = true; controller.abort(); };
  input.on('data', chunk => { try { decode(chunk); } catch { stop(); input.destroy(); output.end(); } });
  input.on('end', stop); input.on('error', stop); output.on('error', stop);
  return { stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
    await serve({ origin: process.argv[2], config });
  } catch { process.stderr.write('Job Apply Assistant helper could not start. Re-run its installer.\n'); process.exitCode = 1; }
}
