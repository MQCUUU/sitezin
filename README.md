# MyCatalog

Catálogo pessoal de filmes e séries com Next.js, Supabase/PostgreSQL e TMDB.

## Arquitetura
- Next.js App Router + React/TypeScript
- Supabase Auth + PostgreSQL + RLS
- Route Handlers no backend para TMDB e CRUD
- TMDB API usando Bearer token exclusivamente no servidor
- Cache HTTP de detalhes/pesquisa e tabela preparada para cache persistente
- UI responsiva em CSS próprio, dark por padrão

## Instalação
1. Instale Node.js 20+.
2. `npm install`
3. Crie um projeto no Supabase.
4. Execute `supabase/schema.sql` no SQL Editor.
5. Copie `.env.example` para `.env.local` e preencha:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `TMDB_API_KEY`
6. No Supabase Auth, configure a URL de redirecionamento para `http://localhost:3000/auth/callback`.
7. `npm run dev`
8. Abra `http://localhost:3000/auth`.

## TMDB
O projeto usa `search/multi` para pesquisa de filmes e séries e depois consulta detalhes/credits. A credencial fica em `TMDB_API_KEY` e nunca é enviada pelo frontend.

## Próximos incrementos
A estrutura já suporta tags, listas e progresso de episódios no banco. Para produção, vale adicionar as telas CRUD desses recursos, cache persistente no `tmdb_cache`, paginação da biblioteca e sincronização detalhada de temporadas/episódios.
