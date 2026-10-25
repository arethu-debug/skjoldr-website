// ============================================================
// SKJOLDR — Terminal prompts for the user scripts
// ask(question, { hidden, json }):
//   hidden — don't echo what is typed or pasted
//   json   — the answer may span several lines: it ends at the first line
//            break where the text is complete JSON, at an empty first line
//            (empty answer), or at an empty line (Enter pressed twice).
// Works in a real terminal (raw mode) and with piped input (for testing).
// ============================================================

import { stdin, stdout, stderr } from 'node:process';
import { createInterface } from 'node:readline';

function isCompleteJson(text) {
  try { JSON.parse(text); return true; } catch { return false; }
}

function askTTY(question, { hidden = false, json = false } = {}) {
  return new Promise(resolve => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    let buf = '';
    let inEscape = false;

    const finish = value => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      resolve(value);
    };

    function onData(chunk) {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];
        if (inEscape) { if (/[A-Za-z~]/.test(ch)) inEscape = false; continue; }   // arrow keys etc.
        if (ch === '\u001b') { inEscape = true; continue; }
        if (ch === '\u0003') { stdin.setRawMode(false); stdout.write('\n'); process.exit(130); } // Ctrl+C
        if (ch === '\u0004') return finish(buf);                                             // Ctrl+D
        if (ch === '\u007f' || ch === '\b') {
          if (buf && !hidden && !buf.endsWith('\n')) stdout.write('\b \b');
          buf = buf.slice(0, -1);
          continue;
        }
        if (ch === '\n' && chunk[i - 1] === '\r') continue;                                    // CRLF = one break
        if (ch === '\r' || ch === '\n') {
          if (!json) return finish(buf);
          buf += '\n';
          if (!hidden) stdout.write('\n');
          continue;
        }
        buf += ch;
        if (!hidden) stdout.write(ch);
      }
      // Only decide at the end of a chunk, so a multi-line paste is taken whole.
      if (json && buf.endsWith('\n')) {
        const value = buf.slice(0, -1);
        if (value.trim() === '' && buf === '\n') return finish('');
        if (value.trim() && isCompleteJson(value)) return finish(value);
        if (buf.endsWith('\n\n')) return finish(buf.slice(0, -2));
      }
    }
    stdin.on('data', onData);
  });
}

// Piped input: lines are read on demand, so a driving process can answer step by step.
function pipedAsk() {
  const lines = createInterface({ input: stdin, terminal: false })[Symbol.asyncIterator]();
  const nextLine = async () => {
    const { value, done } = await lines.next();
    return done ? null : value;
  };
  return async (question, { json = false } = {}) => {
    stdout.write(question + '\n');
    if (!json) return (await nextLine()) ?? '';
    const taken = [];
    for (;;) {
      const line = await nextLine();
      if (line === null || line === '') break;
      taken.push(line);
      if (isCompleteJson(taken.join('\n'))) break;
    }
    return taken.join('\n');
  };
}

export const ask = stdin.isTTY ? askTTY : pipedAsk();

// Exits once everything written so far has reached the terminal or pipe
// (a bare process.exit can cut off the last lines on Windows). Never resolves,
// so `await exit(n)` also stops the calling script.
export function exit(code) {
  return new Promise(() => {
    stderr.write('', () => stdout.write('', () => process.exit(code)));
  });
}
