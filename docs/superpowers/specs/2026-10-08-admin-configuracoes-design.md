# Admin — Aba de Configurações

Status: **design completo** — seções 1 a 4 aprovadas. Aguardando auto-revisão e revisão final do usuário antes de transicionar para `writing-plans`.

## Contexto

Hoje não existe nenhuma UI de admin para editar identidade da barbearia, barbeiros, serviços ou horário de funcionamento — tudo é feito via SQL direto (`supabase/seed.sql`), que inclusive já tem o comentário "Edite esta descrição no painel administrativo em Configurações" apontando pra essa lacuna.

Pedido original do Lucca: aba de Configurações no admin para editar nome da barbearia, barbeiros (nome/quantidade), serviços (nome/quantidade/valor), horário de funcionamento (com intervalo/almoço, aplicado a agendamentos e ao fechamento automático da fila), e o texto da hero abaixo do nome. Na Hero, adicionar botão "Fila de atendimento" ao lado de "Agendar horário", com o horário de funcionamento exibido abaixo dos dois botões.

## Decisões já fechadas com o usuário

- **Horário por barbeiro, não único pra barbearia toda.** Cada barbeiro tem seu próprio horário configurável (não um horário único compartilhado).
- **Texto de horário da Hero é gerado automaticamente** a partir dos horários dos barbeiros, não é mais um campo de texto livre.
- **Abordagem técnica aprovada:** reaproveitar `barber_schedules` como está (já suporta múltiplas janelas por dia — um intervalo de almoço é só duas janelas no mesmo dia). Nenhuma mudança na lógica de cálculo de slots (`lib/slots.ts`, `computeBarberSlots`). Fila efetivamente aberta = toggle manual **E** pelo menos 1 barbeiro ativo dentro do próprio horário agora.

## 1. Modelo de dados (✅ aprovado)

Reaproveita o que já existe, sem colunas novas na maioria dos casos:

- `site_config.name` e `site_config.about` → já existem, só ganham UI (nome da barbearia; texto da hero).
- `barbers` (name, active) e `services` (name, duration_minutes, price_cents, active) → já existem, só ganham CRUD. "Remover" = soft delete (`active = false`), porque agendamentos/fila históricos referenciam esses IDs via FK.
- `barber_schedules` (barber_id, weekday, start_time, end_time) → já existe e já suporta múltiplas janelas por dia. Intervalo de almoço = duas linhas no mesmo `weekday` (ex: 09:00–12:00 e 13:00–18:00). Salvar um dia = apagar as linhas daquele `barber_id`+`weekday` e inserir de novo.

**Única mudança de schema:** remover a coluna `site_config.opening_hours` (texto livre manual). Fica morta — o texto de horário da hero passa a ser calculado a partir de `barber_schedules`.

## 2. Estrutura da aba Configurações (✅ aprovado)

Nova rota `/admin/configuracoes`, com link "Configurações" no header do admin (ao lado de Dashboard/Agenda/Fila). Sub-abas via query string `?tab=` (client-side, sem virar uma tela gigante):

- **Identidade** — nome da barbearia, texto da hero (campo `about`).
- **Barbeiros** — lista nome + ativo/inativo; criar, editar nome, desativar/reativar. Link "editar horário" abre a sub-aba Horários já filtrada nesse barbeiro.
- **Serviços** — lista nome, duração, preço, ativo/inativo; criar/editar/desativar.
- **Horários** — seletor de barbeiro (se houver mais de um) + grade de 7 dias (Dom–Sáb): aberto/fechado, início, fim, checkbox "tem intervalo" (revela início/fim do intervalo). Salva por barbeiro de uma vez.

Todas as ações são Server Actions protegidas por `requireAdmin()` (mesmo padrão de `app/admin/fila/actions.ts`), com `revalidatePath` em `/admin/configuracoes`, `/`, `/agendar`, `/fila`, `/fila/tv`.

## 3. Fila automática + mudanças na Hero (✅ aprovado)

**Horário efetivo da fila.** Novo `lib/business-hours.ts` com duas funções puras (sem Supabase, recebem dados já carregados — ver seção 4) mais uma camada fininha de busca:
- `isAnyBarberOnShiftNow(schedules, weekday, now)`: recebe as linhas de `barber_schedules` dos barbeiros ativos, checa se o horário atual cai dentro de alguma janela do `weekday` de hoje.
- Wiring: `getQueueBoard` e `joinQueue` (`lib/queue-server.ts`) passam a buscar `barber_schedules` dos barbeiros ativos e chamar `isAnyBarberOnShiftNow` antes de decidir o estado efetivo. Fila efetivamente aberta = `site_config.queue_open` (toggle manual) **e** `isAnyBarberOnShiftNow`.
  - `getQueueBoard` (usado por `/admin/fila` e `/fila/tv`) — `queueOpen` passa a refletir o estado efetivo.
  - `joinQueue` — recusa entrada também quando o horário já encerrou, mesmo com o toggle manual ainda em "aberta".

No `/admin/fila`, se o toggle manual estiver "aberto" mas o horário efetivo estiver fechado, mostrar aviso: "Fechada automaticamente — fora do horário de atendimento".

**Resumo do horário (texto da Hero).** `summarizeOpeningHours(schedulesByBarber)` é a segunda função pura de `lib/business-hours.ts`: recebe os horários de todos os barbeiros ativos agrupados, junta as janelas por dia da semana (menor início, maior fim); dias sem nenhum barbeiro trabalhando ficam de fora. Agrupa dias consecutivos com o mesmo horário em faixas — ex. `"Seg a Sex: 09:00–18:00 · Sáb: 09:00–14:00"`. Intervalos de almoço não entram no resumo (só a janela externa do dia). A busca dos dados (`lib/site-data.ts`, usado pela home) é quem chama o Supabase e passa o resultado pronto pra essa função.

**Hero (`components/site/Hero.tsx`).** Dois botões lado a lado: "Agendar horário" (existente) e "Fila de atendimento" (novo, estilo secundário/outline, leva pra `/fila` sempre — a própria página já trata o caso de fila fechada). O texto de horário (resumo calculado) desce para uma linha abaixo dos dois botões.

## 4. Testes e validação (✅ aprovado)

Segue o padrão já usado em `lib/slots.test.ts` e `lib/queue-wait.test.ts`: lógica pura (sem Supabase) em funções que recebem dados já carregados, testada direto com Vitest; o código que busca dados no `AdminClient` (`lib/business-hours.ts` fica fininho e só orquestra) não precisa de teste unitário próprio.

**`lib/business-hours.ts` (novo, lógica pura — testes unitários):**
- `isAnyBarberOnShiftNow(schedules, weekday, now)`:
  - `true` quando existe pelo menos uma janela do `weekday` cujo `[start_time, end_time)` contém `now`.
  - `false` quando não há barbeiro nenhum trabalhando nesse horário (ex: fora do expediente, ou dentro do intervalo de almoço — duas janelas, gap no meio).
  - `false` quando a lista de `schedules` está vazia (nenhum barbeiro ativo).
  - Considera janelas de múltiplos barbeiros — basta um estar disponível.
- `summarizeOpeningHours(schedulesByBarber)`:
  - Une janelas de todos os barbeiros ativos por dia (menor início, maior fim), ignorando o intervalo de almoço (vira uma janela externa só).
  - Dia sem nenhum barbeiro trabalhando não aparece no resumo.
  - Agrupa dias consecutivos com o mesmo horário resultante numa faixa única (ex: Seg–Sex iguais → `"Seg a Sex: 09:00–18:00"`).
  - Dia isolado com horário diferente dos vizinhos aparece separado (ex: `"· Sáb: 09:00–14:00"`).
  - Todos os dias fechados → string vazia ou `null` (Hero esconde a linha de horário nesse caso).

**`getQueueBoard` / `joinQueue` (`lib/queue-server.ts`) — testes de integração existentes servem de referência, adicionar casos:**
- `queueOpen` no retorno de `getQueueBoard` é `false` quando o toggle manual está `true` mas `isAnyBarberOnShiftNow` é `false` (fora do horário).
- `joinQueue` rejeita com mensagem apropriada quando o horário efetivo está fechado, mesmo com toggle manual `true`.

**Server Actions de `/admin/configuracoes` (`app/admin/configuracoes/actions.ts`, novo):**
- Todas exigem `requireAdmin()` — sem sessão, a action retorna erro de autorização (mesmo padrão de `app/admin/fila/actions.ts`, não precisa reteste se o helper já é testado).
- Desativar barbeiro/serviço é soft delete: `active=false`, nunca `DELETE` — cobrir com teste de que o registro continua existindo na tabela (ou, se mockado, que o insert/DELETE não é chamado).
- Salvar horário de um barbeiro: apaga só as linhas daquele `barber_id`+`weekday` antes de inserir — não deve afetar `weekday`s não enviados nem outros barbeiros.

**Verificação manual (não dá pra automatizar sem Supabase local):**
- Rodar `npm run test` e `npm run lint` antes de considerar a fase pronta.
- Fluxo manual no browser: editar nome da barbearia/hero em Identidade → ver refletido em `/`; desativar um barbeiro → ele some do `/agendar` mas aparece (marcado inativo) em Configurações; editar horário com intervalo de almoço → slot de agendamento não aparece durante o almoço; zerar o horário de todos os barbeiros num dia → fila mostra aviso de fechada automaticamente nesse dia mesmo com toggle manual "aberta".

## Próximos passos

1. ~~Aprovar seção 3.~~ ✅
2. ~~Escrever seção 4 (plano de testes).~~ ✅
3. ~~Fazer a auto-revisão do spec.~~ ✅ (corrigida contradição entre seção 3 e 4 sobre assinatura dos helpers de `business-hours.ts`)
4. Usuário revisa o spec completo.
5. Transição para `writing-plans`.
