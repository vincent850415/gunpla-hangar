import fs from 'node:fs/promises';
import path from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('Output path required');
const store = path.resolve('node_modules/.pnpm');
const notices = [];
async function collect(directory) {
  let files;
  try { files = await fs.readdir(directory); } catch { return; }
  if (!files.includes('package.json')) return;
  const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
  for (const file of files.filter(name => /^(LICENSE|NOTICE|COPYING)(\.|$)/i.test(name))) {
    const location = path.join(directory, file);
    if (!(await fs.stat(location)).isFile()) continue;
    notices.push(`\n===== ${pkg.name}@${pkg.version} / ${file} =====\n${await fs.readFile(location, 'utf8')}`);
  }
}
for (const entry of (await fs.readdir(store)).sort()) {
  const modules = path.join(store, entry, 'node_modules');
  let packages;
  try { packages = await fs.readdir(modules); } catch { continue; }
  for (const name of packages.sort()) {
    const directory = path.join(modules, name);
    if (name.startsWith('@')) {
      for (const child of (await fs.readdir(directory)).sort()) await collect(path.join(directory, child));
    } else await collect(directory);
  }
}
if (!notices.length) throw new Error('Dependency license notices not found; install dependencies using pnpm');
await fs.writeFile(output, 'Third-party dependency license and notice files\n' + [...new Set(notices)].join('\n'));
