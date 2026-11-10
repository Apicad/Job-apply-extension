import net from 'node:net';
import { spawn } from 'node:child_process';
// Separate worktrees must never silently test a different checkout's fixture server.
const server = net.createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, JAA_FIXTURE_PORT: String(port) } });
child.on('exit', code => process.exit(code ?? 1));
