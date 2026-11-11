import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import path from 'node:path';
import { draftPrompt, RESPONSE_SCHEMA } from './protocol.mjs';

/** Explicit allowlist: never inherit API keys, provider overrides, shell hooks or SDK credentials. */
export function childEnvironment(source = process.env) {
  const env = {};
  for (const key of ['HOME', 'PATH', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT']) if (source[key]) env[key] = source[key];
  return { ...env, CLAUDE_CODE_SAFE_MODE: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
}
export function draftArguments() {
  return ['--print', '--safe-mode', '--restricted', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--no-session-persistence', '--permission-prompts', 'none', '--output-format', 'json', '--json-schema', JSON.stringify(RESPONSE_SCHEMA)];
}
export function codexArguments(schemaPath) {
  const disabled = ['shell_tool', 'view_image', 'apps', 'plugins', 'multi_agent', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'code_mode', 'code_mode_host', 'memories', 'chronicle', 'hooks', 'shell_snapshot', 'goals', 'sleep_tool', 'skill_search', 'tool_suggest', 'workspace_dependencies', 'remote_plugin', 'in_app_browser', 'agent_message_board'];
  return ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--json', '--color', 'never', '--output-schema', schemaPath, ...disabled.flatMap(name => ['--disable', name]), '-c', 'model_provider="openai"', '-c', 'forced_login_method="chatgpt"', '-c', 'web_search="disabled"', '-c', 'tools.update_plan.enabled=false', '-c', 'tools.experimental_request_user_input.enabled=false', '-c', 'project_doc_max_bytes=0', '-c', 'cloud.skills.enabled=false', '-c', 'orchestrator.mcp.enabled=false', '-'];
}
export function codexAnswer(raw) {
  let events; try { events = raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); } catch { throw Error('Codex returned an unreadable event stream.'); }
  // Current Codex emits this fail-closed notice when its code execution host is
  // deliberately disabled. It is not a model tool call or a failed turn.
  const disabledHostNotice = item => item?.type === 'error' && item.message === 'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.';
  if (events.some(event => event.type === 'turn.failed' || event.type === 'error' || (event.item && !['agent_message', 'reasoning'].includes(event.item.type) && !disabledHostNotice(event.item)))) throw Error('Codex attempted an unexpected operation or could not finish. The draft was discarded.');
  if (!events.some(event => event.type === 'turn.completed')) throw Error('Codex did not complete the answer.');
  const answer = events.filter(event => event.type === 'item.completed' && event.item?.type === 'agent_message').at(-1)?.item?.text;
  if (typeof answer !== 'string' || answer.length > 30_000) throw Error('Codex returned an invalid answer.');
  return answer;
}
export function capture(executable, args, { input = '', cwd, signal, timeoutMs = 60_000, maxBytes = 128 * 1024, captureStderr = false, spawnProcess = spawn, env = childEnvironment() } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Error('AI request cancelled.')); return; }
    let child; let settled = false; let output = ''; let bytes = 0; let errorBytes = 0;
    const stdoutDecoder = new StringDecoder('utf8'); const stderrDecoder = new StringDecoder('utf8');
    const stop = () => { if (!child?.pid) return; try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } };
    const finish = (error, result) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) { stop(); reject(error); } else resolve(result);
    };
    const abort = () => finish(Error('AI request cancelled.'));
    const timer = setTimeout(() => finish(Error('AI took too long. Your basic fields are already filled; try drafting again later.')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    try { child = spawnProcess(executable, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false, detached: process.platform !== 'win32' }); }
    catch { finish(Error('Could not start the connected AI tool. Run the helper installer again.')); return; }
    child.on('error', () => finish(Error('Could not start the connected AI tool. Run the helper installer again.')));
    child.stdout.on('data', data => { bytes += data.length; if (bytes > maxBytes) finish(Error('AI response exceeded the size limit.')); else output += stdoutDecoder.write(data); });
    child.stderr.on('data', data => { errorBytes += data.length; if (errorBytes > maxBytes) finish(Error('AI diagnostic output exceeded the size limit.')); else if (captureStderr) output += stderrDecoder.write(data); });
    child.on('close', code => code === 0 ? finish(null, output + stdoutDecoder.end() + (captureStderr ? stderrDecoder.end() : '')) : finish(Error('Connected AI could not complete this request. Check its sign-in or plan limits; no paid fallback was used.')));
    child.stdin.on('error', () => { /* Child exit is handled above. */ });
    child.stdin.end(input);
  });
}

export async function checkAccount(executable, { provider = 'claude', ...options } = {}) {
  if (provider === 'codex') {
    const raw = await capture(executable, ['login', 'status'], { ...options, captureStderr: true, timeoutMs: 10_000 });
    if (!/Logged in using ChatGPT/i.test(raw)) throw Error('Sign in to Codex with ChatGPT. API-key accounts are not used by this helper.');
    return { connected: true, provider: 'Codex', message: 'Connected to Codex. Uses your existing ChatGPT plan and its normal limits.' };
  }
  const raw = await capture(executable, ['auth', 'status'], { ...options, timeoutMs: 10_000 });
  let status; try { status = JSON.parse(raw); } catch { throw Error('Could not verify the AI account. Update Claude Code and sign in.'); }
  if (!status.loggedIn || status.authMethod !== 'claude.ai' || status.apiProvider !== 'firstParty') throw Error('Sign in to Claude Code with your Claude plan. API-key accounts are not used by this helper.');
  return { connected: true, provider: 'Claude Code', message: 'Connected to Claude Code. Uses your existing plan and its normal limits.' };
}

export async function generate(executable, request, { signal, provider = 'claude', ...options } = {}) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'job-apply-ai-'));
  try {
    await checkAccount(executable, { ...options, signal, cwd, provider });
    if (provider === 'codex') {
      const schemaPath = path.join(cwd, 'response-schema.json'); await writeFile(schemaPath, JSON.stringify(RESPONSE_SCHEMA), { mode: 0o600 });
      const raw = await capture(executable, codexArguments(schemaPath), { ...options, signal, cwd, input: draftPrompt(request) });
      return codexAnswer(raw);
    }
    const raw = await capture(executable, draftArguments(), { ...options, signal, cwd, input: draftPrompt(request) });
    let result; try { result = JSON.parse(raw); } catch { throw Error('The AI returned an unreadable response.'); }
    if (result.is_error || result.subtype !== 'success' || !result.structured_output || typeof result.structured_output !== 'object') throw Error('The AI did not return a complete structured answer.');
    const answer = JSON.stringify(result.structured_output);
    if (answer.length > 30_000) throw Error('The AI answer is too large.');
    return answer;
  } finally { await rm(cwd, { recursive: true, force: true }); }
}
