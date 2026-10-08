import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, statSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export function findCodex() {
  if (process.env.MOVIS_CODEX_BIN) return process.env.MOVIS_CODEX_BIN;
  const root = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  if (existsSync(root)) {
    for (const dir of readdirSync(root).sort((a, b) => statSync(path.join(root, b)).mtimeMs - statSync(path.join(root, a)).mtimeMs)) {
      const file = path.join(root, dir, 'codex.exe');
      if (existsSync(file)) return file;
    }
  }
  return process.platform === 'win32' ? 'codex.exe' : 'codex';
}
export class CodexClient extends EventEmitter {
  constructor(runtime) {
    super();
    this.runtime = runtime;
    this.pending = new Map();
    this.nextId = 0;
  }
  async start() {
    if (this.starting) return this.starting;
    this.starting = this.boot().catch(error => {
      this.starting = null;
      throw error;
    });
    return this.starting;
  }
  async boot() {
    const home = path.join(this.runtime, 'codex');
    mkdirSync(home, {
      recursive: true
    });
    // Use a dedicated configuration: POS agents must not inherit coding plugins, shell access or project instructions.
    const original = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json');
    if (!existsSync(path.join(home, 'auth.json')) && existsSync(original)) copyFileSync(original, path.join(home, 'auth.json'));
    writeFileSync(path.join(home, 'config.toml'), ['cli_auth_credentials_store = "file"', 'forced_login_method = "chatgpt"', 'sandbox_mode = "read-only"', 'approval_policy = "never"', 'web_search = "disabled"', '[features]', 'shell_tool = false', 'apply_patch_freeform = false', 'multi_agent = false', 'apps = false', 'memories = false', 'js_repl = false'].join('\n'));
    const env = {
      ...process.env,
      CODEX_HOME: home
    };
    for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|AZURE_OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN|ACCESS_TOKEN)$/.test(key)) delete env[key];
    this.proc = spawn(findCodex(), ['app-server', '--listen', 'stdio://'], {
      cwd: this.runtime,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.proc.on('error', error => this.fail(error));
    this.proc.on('exit', () => {
      this.starting = null;
      this.fail(new Error('Codex 연결이 종료되었습니다. 연결 상태를 다시 확인하세요.'));
    });
    this.proc.stderr.on('data', () => {}); // Never relay credential-bearing diagnostics to the browser.
    const lines = createInterface({
      input: this.proc.stdout
    });
    lines.on('line', line => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.id !== undefined && !msg.method) {
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(msg.id);
        msg.error ? entry.reject(new Error(msg.error.message)) : entry.resolve(msg.result);
      } else this.emit('message', msg);
    });
    await this.request('initialize', {
      clientInfo: {
        name: 'movis_pos',
        title: 'MOVIS Intelligence',
        version: '2.0.0'
      },
      capabilities: {
        experimentalApi: true
      }
    });
    this.send({
      method: 'initialized',
      params: {}
    });
  }
  fail(error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.emit('disconnected', error);
  }
  send(message) {
    this.proc?.stdin.write(JSON.stringify(message) + '\n');
  }
  reply(id, result) {
    this.send({
      id,
      result
    });
  }
  request(method, params = {}, timeout = 45000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: 연결 응답 시간이 초과되었습니다.`));
      }, timeout);
      this.pending.set(id, {
        resolve,
        reject,
        timer
      });
      this.send({
        id,
        method,
        params
      });
    });
  }
  stop() {
    this.proc?.kill();
  }
}
