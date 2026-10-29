/** O rótulo de versão do menu vem do CHANGELOG (vite.config.ts) e tem de bater com o package.json. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('versão publicada', () => {
  it('o primeiro título do CHANGELOG tem a mesma versão do package.json', () => {
    const t = readFileSync('CHANGELOG.md', 'utf8').match(/^## (\d+\.\d+\.\d+) — (?:Fase (\d+)|([^\n(]+))/m);
    expect(t).toBeTruthy();
    expect(t![1]).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
  });
  it('o menu não tem versão escrita à mão', () => {
    expect(readFileSync('src/app/screens/MenuScreen.tsx', 'utf8')).not.toMatch(/v\d+\.\d+ · Fase \d+/);
  });
});
