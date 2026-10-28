// npm run medir-simulacao [-- --dias=60 --orcamento=4]: roda tests/medicao-simulacao.test.ts com MEDIR=1 (precisa do Vite por causa dos eventos).
// Sem --orcamento mede o modo síncrono (o dia inteiro dentro do step()); com --orcamento=N, o modo com orçamento de N ms por passo.
const { spawnSync } = require('node:child_process');
const arg = (nome) => { const a = process.argv.find((x) => x.startsWith(`--${nome}=`)); return a ? a.slice(nome.length + 3) : null; };
const dias = arg('dias'), orc = arg('orcamento');
const r = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/medicao-simulacao.test.ts', '--reporter=verbose'], {
  stdio: 'inherit', env: { ...process.env, MEDIR: '1', ...(dias ? { MEDIR_DIAS: dias } : {}), ...(orc ? { MEDIR_ORCAMENTO: orc } : {}) },
});
process.exit(r.status ?? 1);
