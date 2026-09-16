#!/usr/bin/env node
// RC Boat Arena · DSH 启用/关闭脚本
// 只做两件可逆的事，不改官方依赖、不改聊天行为：
//   1) 在 $DSH_HOME/profiles/node_modules 下建一个指向本插件的软链（DSH 官方的扁平模块回退目录，
//      普通插件名因此能被 profile 解析）；
//   2) 在 $DSH_HOME/profiles/<profile>/cordis.patch.yml 里插入一条 loader 条目。
//
//   node dsh-plugin/install.mjs status
//   node dsh-plugin/install.mjs enable
//   node dsh-plugin/install.mjs disable
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_NAME = 'dsh-rc-boat-arena';
const PROFILE_NAME = process.env.DSH_PROFILE || 'web';
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const PROFILE_DIR = path.join(DSH_HOME, 'profiles', PROFILE_NAME);
const PATCH_FILE = path.join(PROFILE_DIR, 'cordis.patch.yml');
const LINK_PATH = path.join(DSH_HOME, 'profiles', 'node_modules', PKG_NAME);
const MARK = '# rc-boat-arena-panel (由 rc-boat-arena/dsh-plugin/install.mjs 管理)';

function entryBlock() {
  return [MARK, '- insert:', '    - id: rc-boat-arena', "      name: '" + PKG_NAME + "'", ''].join('\n');
}
function readPatch() {
  try { return fs.readFileSync(PATCH_FILE, 'utf8'); } catch (e) { return null; }
}
function stripBlock(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === MARK) {
      i++;
      if (lines[i] !== undefined && lines[i].trim() === '- insert:') {
        i++;
        while (i < lines.length && (lines[i].trim() === '' || /^\s/.test(lines[i]))) i++;
      }
      i--;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}
function isEmptyList(text) {
  const body = text.replace(/^\s*#.*$/gm, '').trim();
  return body === '' || body === '[]';
}
function linkState() {
  try {
    const st = fs.lstatSync(LINK_PATH);
    if (!st.isSymbolicLink()) return 'occupied';
    const target = fs.readlinkSync(LINK_PATH);
    return path.resolve(path.dirname(LINK_PATH), target) === HERE ? 'linked' : 'other';
  } catch (e) { return 'absent'; }
}

const cmd = process.argv[2] || 'status';
const current = readPatch();
if (current === null) {
  console.error('找不到 profile patch 文件: ' + PATCH_FILE);
  console.error('请先运行过一次 dsh web（会自动生成 profile 目录）。');
  process.exit(2);
}
const enabled = current.includes(MARK);

if (cmd === 'status') {
  console.log('DSH_HOME        : ' + DSH_HOME);
  console.log('profile         : ' + PROFILE_NAME + '  (' + PROFILE_DIR + ')');
  console.log('patch 文件      : ' + PATCH_FILE + (enabled ? '  [已插入条目]' : '  [无条目]'));
  console.log('模块软链        : ' + LINK_PATH + '  [' + linkState() + ']');
  console.log('当前状态        : ' + (enabled ? '已启用' : '未启用'));
  process.exit(0);
}

let base = stripBlock(current);
if (isEmptyList(base)) {
  // 保留原有注释头，只移除空列表 [] 这一行
  base = base.replace(/^\s*\[\]\s*$/m, '').replace(/\n{3,}/g, '\n\n').trim();
  base = base === '' ? '# 用户 patch 层（原为空列表）' : base;
  base += '\n';
}

if (cmd === 'enable') {
  fs.mkdirSync(path.dirname(LINK_PATH), { recursive: true });
  const ls = linkState();
  if (ls === 'absent') fs.symlinkSync(HERE, LINK_PATH, 'dir');
  else if (ls === 'other') { console.error('软链已存在但指向别处: ' + LINK_PATH); process.exit(2); }
  if (!enabled) {
    const merged = base.replace(/\[\]\s*$/, '').trimEnd() + '\n\n' + entryBlock();
    fs.writeFileSync(PATCH_FILE, merged);
  }
  console.log('已启用 rc-boat-arena 面板。');
  console.log('  模块软链: ' + LINK_PATH + ' -> ' + HERE);
  console.log('  loader 条目: ' + PATCH_FILE);
  console.log('DSH 会监听 patch 文件并热应用；若面板未出现，重启一次 dsh web 即可。');
  process.exit(0);
}
if (cmd === 'disable' || cmd === 'restore') {
  if (enabled) {
    // 关键：必须留下可解析的顶层数组（[]）。只留注释会让 patch 解析失败，
    // DSH 会保留"最后一个可用树"，插件看起来关不掉。
    const note = '# rc-boat-arena-panel 已关闭。重新启用：node ' + path.join(HERE, 'install.mjs') + ' enable';
    const body = stripBlock(current)
      .split('\n').filter((l) => !l.startsWith('# rc-boat-arena-panel 已关闭'))
      .join('\n')
      .replace(/^\s*\[\]\s*$/m, '').replace(/\n{3,}/g, '\n\n').trimEnd();
    fs.writeFileSync(PATCH_FILE, body + '\n\n' + note + '\n[]\n');
  }
  const ls = linkState();
  if (ls === 'linked') fs.unlinkSync(LINK_PATH);
  console.log('已关闭 rc-boat-arena 面板（条目与软链都已移除，其余配置保持不变）。');
  process.exit(0);
}
console.error('用法: node dsh-plugin/install.mjs [status|enable|disable]');
process.exit(2);
