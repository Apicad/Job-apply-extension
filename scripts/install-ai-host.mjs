import { access, chmod, copyFile, mkdir, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST_NAME } from '../native-host/protocol.mjs';
import { checkAccount } from '../native-host/runner.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--extension-id' || !/^[a-p]{32}$/.test(args[1])) {
  console.error('Usage: node scripts/install-ai-host.mjs --extension-id YOUR_CHROME_EXTENSION_ID');
  process.exit(1);
}
if (!['darwin', 'linux'].includes(process.platform)) throw Error('This installer supports macOS and Linux. Windows setup is not available yet.');
const searchPaths = String(process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
const candidates = [
  { provider: 'codex', executable: '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex' },
  ...searchPaths.map(dir => ({ provider: 'codex', executable: path.join(dir, 'codex') })),
  { provider: 'claude', executable: path.join(homedir(), '.local/bin/claude') },
  ...searchPaths.map(dir => ({ provider: 'claude', executable: path.join(dir, 'claude') }))
];
let executable; let provider;
for (const candidate of candidates) {
  try { await access(candidate.executable, constants.X_OK); executable = await realpath(candidate.executable); provider = candidate.provider; break; } catch { /* Try next installed location. */ }
}
if (!executable) throw Error('Install Codex or Claude Code from its official source and sign in with your plan, then run this command again.');
const status = await checkAccount(executable, { provider });
const source = fileURLToPath(new URL('../native-host/', import.meta.url));
const destination = path.join(homedir(), '.local/share/job-apply-assistant/native-host');
const manifests = process.platform === 'darwin' ? path.join(homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts') : path.join(homedir(), '.config/google-chrome/NativeMessagingHosts');
await mkdir(destination, { recursive: true, mode: 0o700 });
await mkdir(manifests, { recursive: true, mode: 0o700 });
for (const name of ['host.mjs', 'protocol.mjs', 'runner.mjs']) { await copyFile(path.join(source, name), path.join(destination, name)); await chmod(path.join(destination, name), 0o600); }
const origin = `chrome-extension://${args[1]}/`;
await writeFile(path.join(destination, 'config.json'), JSON.stringify({ origin, executable, provider }, null, 2) + '\n', { mode: 0o600 });
await chmod(path.join(destination, 'config.json'), 0o600);
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const launcher = path.join(destination, 'launch');
await writeFile(launcher, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(destination, 'host.mjs'))} "$@"\n`, { mode: 0o700 });
await chmod(launcher, 0o700);
const manifestPath = path.join(manifests, `${HOST_NAME}.json`);
await writeFile(manifestPath, JSON.stringify({ name: HOST_NAME, description: 'Job Apply Assistant — your signed-in AI connection', path: launcher, type: 'stdio', allowed_origins: [origin] }, null, 2) + '\n', { mode: 0o600 });
await chmod(manifestPath, 0o600);
console.log(`Installed the local ${status.provider} connection for this extension only.`);
console.log('Return to the sidebar and choose Connect AI. Normal account plan limits apply; no API-key fallback is used.');
console.log(`Native manifest: ${manifestPath}`);
