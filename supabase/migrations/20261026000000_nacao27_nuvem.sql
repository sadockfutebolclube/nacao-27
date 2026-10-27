-- NAÇÃO 27 — nuvem (Fase 9): saves por jogador e ranking público de legados.
-- Aplicar num projeto Supabase próprio do jogo. Exige "Anonymous sign-ins" ou "Email" habilitado em Auth.

-- ── Saves ────────────────────────────────────────────────────────────────────────
create table if not exists public.saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  modo text not null check (modo in ('cidade', 'presidente')),
  rotulo text not null check (char_length(rotulo) <= 120),
  -- JSON do save comprimido com gzip e codificado em base64
  dados text not null check (char_length(dados) <= 12000000),
  tamanho integer not null,
  criado_em timestamptz not null default now()
);
create index if not exists saves_user_criado on public.saves (user_id, criado_em desc);

alter table public.saves enable row level security;
create policy "saves: dono lê" on public.saves for select to authenticated using ((select auth.uid()) = user_id);
create policy "saves: dono grava" on public.saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saves: dono apaga" on public.saves for delete to authenticated using ((select auth.uid()) = user_id);

-- ── Ranking de legados ───────────────────────────────────────────────────────────
create table if not exists public.ranking (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apelido text not null check (char_length(apelido) between 2 and 24),
  modo text not null check (modo in ('governador', 'presidente')),
  uf text check (uf is null or char_length(uf) = 2),
  partido text check (partido is null or char_length(partido) <= 8),
  nota integer not null check (nota between 0 and 100),
  aprovacao numeric(5, 1) not null check (aprovacao between 0 and 100),
  desfecho text not null check (char_length(desfecho) <= 40),
  anos integer not null check (anos between 0 and 12),
  criado_em timestamptz not null default now()
);
create index if not exists ranking_modo_nota on public.ranking (modo, nota desc);

alter table public.ranking enable row level security;
create policy "ranking: todos leem" on public.ranking for select to anon, authenticated using (true);
create policy "ranking: dono publica" on public.ranking for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ranking: dono apaga" on public.ranking for delete to authenticated using ((select auth.uid()) = user_id);
