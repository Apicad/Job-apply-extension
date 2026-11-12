import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git('status', '--porcelain')) throw Error('Commit the reviewed changes before packaging; the bundle must identify an exact clean snapshot.');
const sha = git('rev-parse', 'HEAD');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const output = path.resolve(process.argv[2] ?? path.join(root, '../release-artifacts', `${pkg.version}-${sha.slice(0, 12)}`));
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(output, { recursive: false }); // Never replace an earlier release.
const wxt = JSON.parse(await fs.readFile(path.join(root, 'node_modules/wxt/package.json'), 'utf8'));
execFileSync(process.execPath, [path.join(root, 'node_modules/wxt', typeof wxt.bin === 'string' ? wxt.bin : wxt.bin.wxt), 'build'], { cwd: root, stdio: 'inherit' });
const extension = path.join(root, '.output/chrome-mv3');
const manifest = JSON.parse(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8'));
if (manifest.version !== pkg.version || manifest.host_permissions?.length || manifest.content_scripts?.length) throw Error('Refusing mismatched or non-production extension.');
const bundle = path.join(output, 'job-apply-assistant');
await fs.mkdir(bundle);
await fs.cp(extension, path.join(bundle, 'extension'), { recursive: true });
const included = [
  'scripts/install-ai-host.mjs', 'scripts/demo-server.mjs',
  'native-host/host.mjs', 'native-host/protocol.mjs', 'native-host/runner.mjs', 'native-host/README.md',
  'demo/index.html', 'demo/sample-resume.txt',
  'tests/fixtures/greenhouse-live.html', 'tests/fixtures/lever.html', 'tests/fixtures/ashby.html', 'tests/fixtures/hackathon.html',
  'docs/hackathon/START-HERE.md', 'docs/hackathon/COMPATIBILITY.md',
];
const practiceFixturesIncluded = await fs.access(path.join(root, 'tests/fixtures/lever.html')).then(()=>true,()=>false);
for (const file of included) {
  if(file.startsWith('tests/') && !practiceFixturesIncluded) continue;
  const destination = path.join(bundle, file.startsWith('docs/hackathon/') ? path.basename(file) : file);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(root, file), destination);
}
// Owner-private tests and planning documents are deliberately excluded from the committed snapshot.
git('archive', '--format=zip', '--prefix=source/', `--output=${path.join(bundle, 'source.zip')}`, sha);
await fs.writeFile(path.join(bundle, 'RELEASE.json'), JSON.stringify({ version: pkg.version, sha, tree: git('rev-parse', 'HEAD^{tree}'), branch: git('rev-parse', '--abbrev-ref', 'HEAD'), build: 'production', plansIncludedInSource: false, testsIncludedInSource: false, practiceFixturesIncluded, createdAt: new Date().toISOString(), node: process.version, platformTests: 'See COMPATIBILITY.md and the separate exact-SHA evidence report.' }, null, 2) + '\n');
const zip = {}; const sums = [];
async function collect(directory) {
  for (const name of (await fs.readdir(directory)).sort()) {
    const file = path.join(directory, name);
    if ((await fs.stat(file)).isDirectory()) await collect(file);
    else {
      const relative = path.relative(bundle, file).split(path.sep).join('/');
      const bytes = await fs.readFile(file);
      zip[`job-apply-assistant/${relative}`] = bytes;
      sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${relative}`);
    }
  }
}
await collect(bundle);
const checksums = sums.join('\n') + '\n';
await fs.writeFile(path.join(bundle, 'SHA256SUMS'), checksums);
zip['job-apply-assistant/SHA256SUMS'] = Buffer.from(checksums);
const archive = path.join(output, `job-apply-assistant-${pkg.version}.zip`);
const bytes = zipSync(zip, { level: 6 });
await fs.writeFile(archive, bytes);
await fs.writeFile(`${archive}.sha256`, `${createHash('sha256').update(bytes).digest('hex')}  ${path.basename(archive)}\n`);
console.log(JSON.stringify({ sha, archive, bundle }));
