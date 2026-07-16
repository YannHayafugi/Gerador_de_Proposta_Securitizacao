-- ============================================================================
-- Schema do banco de dados — Análise de TR e Gerador de Propostas (FIA)
-- Versão 2 — alinhada à especificação funcional v1.1
-- (docs/ESPECIFICAÇÃO FUNCIONAL DO SISTEMA - v1.1.docx)
--
-- Como aplicar:
-- 1. Acesse o painel do seu projeto em supabase.com/dashboard
-- 2. Vá em "SQL Editor" (menu lateral) > "New query"
-- 3. Cole todo este arquivo e clique em "Run"
--
-- Este script é seguro para rodar mais de uma vez (usa IF NOT EXISTS / OR REPLACE).
-- Ele substitui as tabelas "analises" e "analise_itens" da primeira versão da
-- análise de TR (modelo de 11 itens / aceitar-recusar), que foi descontinuado.
-- ============================================================================

drop table if exists public.analise_itens cascade;
drop table if exists public.analises cascade;

-- ----------------------------------------------------------------------------
-- 1. PROFILES — dados e permissões de cada usuário do sistema (inalterado)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome_completo text,
  perfil text not null default 'visualizador'
    check (perfil in ('admin', 'editor', 'visualizador')),
  pode_editar_analises boolean not null default false,
  pode_excluir_analises boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil e permissões de cada usuário autenticado.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 1.1 ORGAOS — cadastro central de órgãos (entes), reaproveitado tanto pela
--     análise de TR quanto pela geração de propostas. Substitui o
--     preenchimento avulso de "nome do ente" em cada tela.
-- ----------------------------------------------------------------------------
create table if not exists public.orgaos (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references public.profiles (id),
  tipo_ente text not null check (tipo_ente in ('Município', 'Estado')),
  razao_social text not null,
  -- Apenas dígitos (14). Nullable no banco (partial unique index abaixo) para
  -- não quebrar cadastros antigos; a obrigatoriedade é garantida pela aplicação.
  cnpj text,
  cidade text not null,
  uf text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.orgaos is 'Cadastro central de órgãos (municípios/estados) — base para análise de TR e geração de propostas.';

-- "create table if not exists" acima não altera uma tabela que já existia de
-- uma execução anterior deste script — cnpj (novo nesta versão) precisa ser
-- adicionado explicitamente aqui, para instalações já existentes do banco.
alter table public.orgaos add column if not exists cnpj text;

create index if not exists idx_orgaos_razao_social on public.orgaos (razao_social);

-- Impede cadastrar dois órgãos com o mesmo CNPJ. Índice parcial (ignora
-- linhas com cnpj nulo) para não quebrar cadastros antigos sem CNPJ ainda.
create unique index if not exists idx_orgaos_cnpj_unico on public.orgaos (cnpj) where cnpj is not null;

-- ----------------------------------------------------------------------------
-- 1.2 ORGAOS_CONTATOS — um ou mais contatos (responsáveis) por órgão. O nome,
--     cargo e e-mail são opcionais no cadastro do órgão; passam a ser
--     exigidos apenas no momento de gerar uma proposta (seleção obrigatória
--     de um contato) ou de emitir o relatório de análise de TR (deve existir
--     ao menos um contato ao final, sem interferir na análise em si). O
--     telefone (com DDD) é obrigatório sempre que um contato é criado — a
--     obrigatoriedade é garantida pela aplicação, o banco mantém a coluna
--     nullable para não quebrar contatos antigos.
-- ----------------------------------------------------------------------------
create table if not exists public.orgaos_contatos (
  id uuid primary key default gen_random_uuid(),
  orgao_id uuid not null references public.orgaos (id) on delete cascade,
  nome_completo text not null,
  cargo text not null,
  telefone text,
  email text not null,
  created_at timestamptz not null default now()
);

comment on table public.orgaos_contatos is 'Contatos (responsáveis) de um órgão — um órgão pode ter vários.';

create index if not exists idx_orgaos_contatos_orgao_id on public.orgaos_contatos (orgao_id);

-- ----------------------------------------------------------------------------
-- 2. CADASTROS_TR — um registro por TR analisado (dados do ente + resultado bruto da IA)
-- ----------------------------------------------------------------------------
create table if not exists public.cadastros_tr (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references public.profiles (id),
  -- Órgão de origem (cadastro central em /orgaos). Nullable para não quebrar
  -- cadastros antigos, criados antes de essa vinculação existir.
  orgao_id uuid references public.orgaos (id),
  classificacao text not null check (classificacao in ('Município', 'Estado')),
  nome_ente text not null,
  uf text not null,
  nome_responsavel text not null,
  cargo text not null,
  telefone text,
  email text not null,
  objeto_tr text not null default 'Securitizacao',
  nome_arquivo_tr text not null,
  -- JSON bruto retornado pela IA (ver lib/tr/types.ts -> ResultadoAnaliseTR), guardado para auditoria
  resultado_bruto_ia jsonb not null,
  status text not null default 'em_analise'
    check (status in ('em_analise', 'concluida')),
  relatorio_gerado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cadastros_tr is 'Um cadastro = um TR de um ente analisado pelo sistema.';

-- "create table if not exists" acima não altera uma tabela que já existia de
-- uma execução anterior deste script — por isso a coluna orgao_id (nova
-- nesta versão) precisa ser adicionada explicitamente aqui, para instalações
-- já existentes do banco.
alter table public.cadastros_tr add column if not exists orgao_id uuid references public.orgaos (id);

-- ----------------------------------------------------------------------------
-- 3. ACHADOS_TR — cada achado apresentado em tela (derivado das regras de
--    negócio a partir do resultado bruto), com a ciência e o comentário do usuário
-- ----------------------------------------------------------------------------
create table if not exists public.achados_tr (
  id uuid primary key default gen_random_uuid(),
  cadastro_id uuid not null references public.cadastros_tr (id) on delete cascade,
  -- id estável do achado dentro do cadastro, ver lib/tr/types.ts (Achado.id):
  -- "item1", "item2-prazo", "item3-geral", "item4-etapa1", "item8-0" etc.
  achado_id text not null,
  item_numero text not null, -- "1", "2", "3", "4 — Etapa 1", "7-a" etc.
  titulo text not null,
  texto text not null,
  comentario_obrigatorio boolean not null default false,
  ciente boolean not null default false,
  comentario text,
  ciente_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cadastro_id, achado_id)
);

comment on table public.achados_tr is 'Achados de atenção de um cadastro_tr, com ciência e comentário do usuário.';

-- ----------------------------------------------------------------------------
-- 3.1 ACHADOS_TR_HISTORICO — trilha de versões: uma linha por edição feita em
--     um achado já salvo, com a justificativa obrigatória da alteração.
--     Tabela somente de inserção (não há update/delete) — é o log de auditoria.
-- ----------------------------------------------------------------------------
create table if not exists public.achados_tr_historico (
  id uuid primary key default gen_random_uuid(),
  achado_id uuid not null references public.achados_tr (id) on delete cascade,
  versao int not null,
  ciente_anterior boolean not null,
  comentario_anterior text,
  ciente_novo boolean not null,
  comentario_novo text,
  justificativa_edicao text not null,
  editado_por uuid references public.profiles (id),
  editado_em timestamptz not null default now()
);

comment on table public.achados_tr_historico is 'Histórico de versões (auditoria) de edições em um achado já salvo, com justificativa obrigatória.';

-- ----------------------------------------------------------------------------
-- 4. Índices
-- ----------------------------------------------------------------------------
create index if not exists idx_cadastros_tr_criado_por on public.cadastros_tr (criado_por);
create index if not exists idx_cadastros_tr_orgao_id on public.cadastros_tr (orgao_id);
create index if not exists idx_achados_tr_cadastro_id on public.achados_tr (cadastro_id);
create index if not exists idx_achados_tr_historico_achado_id on public.achados_tr_historico (achado_id);

-- ----------------------------------------------------------------------------
-- 5. Row Level Security (RLS)
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.orgaos enable row level security;
alter table public.orgaos_contatos enable row level security;
alter table public.cadastros_tr enable row level security;
alter table public.achados_tr enable row level security;

-- orgaos / orgaos_contatos: cadastro central e compartilhado — qualquer
-- usuário autenticado e ativo pode ver, cadastrar e editar órgãos e
-- contatos (não há "dono" individual como em cadastros_tr).
drop policy if exists "orgaos_select_authenticated" on public.orgaos;
create policy "orgaos_select_authenticated"
  on public.orgaos for select
  to authenticated
  using (true);

drop policy if exists "orgaos_insert_authenticated" on public.orgaos;
create policy "orgaos_insert_authenticated"
  on public.orgaos for insert
  to authenticated
  with check (true);

drop policy if exists "orgaos_update_authenticated" on public.orgaos;
create policy "orgaos_update_authenticated"
  on public.orgaos for update
  to authenticated
  using (true);

drop policy if exists "orgaos_contatos_select_authenticated" on public.orgaos_contatos;
create policy "orgaos_contatos_select_authenticated"
  on public.orgaos_contatos for select
  to authenticated
  using (true);

drop policy if exists "orgaos_contatos_insert_authenticated" on public.orgaos_contatos;
create policy "orgaos_contatos_insert_authenticated"
  on public.orgaos_contatos for insert
  to authenticated
  with check (true);

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_admin_or_self_basic" on public.profiles;
create policy "profiles_update_admin_or_self_basic"
  on public.profiles for update
  to authenticated
  using (
    id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.perfil = 'admin')
  );

-- cadastros_tr: usuário vê os próprios; admin vê todos.
drop policy if exists "cadastros_tr_select_own_or_admin" on public.cadastros_tr;
create policy "cadastros_tr_select_own_or_admin"
  on public.cadastros_tr for select
  to authenticated
  using (
    criado_por = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.perfil = 'admin')
  );

drop policy if exists "cadastros_tr_insert_own" on public.cadastros_tr;
create policy "cadastros_tr_insert_own"
  on public.cadastros_tr for insert
  to authenticated
  with check (criado_por = auth.uid());

drop policy if exists "cadastros_tr_update_permitido" on public.cadastros_tr;
create policy "cadastros_tr_update_permitido"
  on public.cadastros_tr for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.perfil = 'admin' or (criado_por = auth.uid() and p.pode_editar_analises))
    )
  );

drop policy if exists "cadastros_tr_delete_permitido" on public.cadastros_tr;
create policy "cadastros_tr_delete_permitido"
  on public.cadastros_tr for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.perfil = 'admin' or (criado_por = auth.uid() and p.pode_excluir_analises))
    )
  );

-- achados_tr: segue a permissão do cadastro-pai
drop policy if exists "achados_tr_select" on public.achados_tr;
create policy "achados_tr_select"
  on public.achados_tr for select
  to authenticated
  using (
    exists (
      select 1 from public.cadastros_tr c
      where c.id = achados_tr.cadastro_id
        and (c.criado_por = auth.uid()
             or exists (select 1 from public.profiles p where p.id = auth.uid() and p.perfil = 'admin'))
    )
  );

drop policy if exists "achados_tr_insert" on public.achados_tr;
create policy "achados_tr_insert"
  on public.achados_tr for insert
  to authenticated
  with check (
    exists (select 1 from public.cadastros_tr c where c.id = achados_tr.cadastro_id and c.criado_por = auth.uid())
  );

drop policy if exists "achados_tr_update" on public.achados_tr;
create policy "achados_tr_update"
  on public.achados_tr for update
  to authenticated
  using (
    exists (
      select 1 from public.cadastros_tr c
      join public.profiles p on p.id = auth.uid()
      where c.id = achados_tr.cadastro_id
        and (p.perfil = 'admin' or (c.criado_por = auth.uid() and p.pode_editar_analises))
    )
  );

drop policy if exists "achados_tr_delete" on public.achados_tr;
create policy "achados_tr_delete"
  on public.achados_tr for delete
  to authenticated
  using (
    exists (
      select 1 from public.cadastros_tr c
      join public.profiles p on p.id = auth.uid()
      where c.id = achados_tr.cadastro_id
        and (p.perfil = 'admin' or (c.criado_por = auth.uid() and p.pode_excluir_analises))
    )
  );

-- achados_tr_historico: segue a permissão do achado/cadastro (mesma regra de
-- "quem pode editar" — só quem edita pode criar uma entrada de histórico).
-- Não existe update nem delete: é um log de auditoria (append-only).
alter table public.achados_tr_historico enable row level security;

drop policy if exists "achados_tr_historico_select" on public.achados_tr_historico;
create policy "achados_tr_historico_select"
  on public.achados_tr_historico for select
  to authenticated
  using (
    exists (
      select 1 from public.achados_tr a
      join public.cadastros_tr c on c.id = a.cadastro_id
      where a.id = achados_tr_historico.achado_id
        and (c.criado_por = auth.uid()
             or exists (select 1 from public.profiles p where p.id = auth.uid() and p.perfil = 'admin'))
    )
  );

drop policy if exists "achados_tr_historico_insert" on public.achados_tr_historico;
create policy "achados_tr_historico_insert"
  on public.achados_tr_historico for insert
  to authenticated
  with check (
    exists (
      select 1 from public.achados_tr a
      join public.cadastros_tr c on c.id = a.cadastro_id
      join public.profiles p on p.id = auth.uid()
      where a.id = achados_tr_historico.achado_id
        and (p.perfil = 'admin' or (c.criado_por = auth.uid() and p.pode_editar_analises))
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Primeiro usuário administrador
-- ----------------------------------------------------------------------------
-- Depois de criar sua própria conta pelo login do sistema (tarefa ainda pendente
-- no projeto), rode o comando abaixo substituindo o e-mail para promover essa
-- conta a administrador:
--
-- update public.profiles set perfil = 'admin', pode_editar_analises = true,
--   pode_excluir_analises = true where email = 'seu-email@exemplo.com';
