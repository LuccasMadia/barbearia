# Admin — Aba de Configurações

Status: **em andamento** — seções 1 e 2 aprovadas, seção 3 proposta (aguardando aprovação), seção 4 (testes) ainda não escrita.

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

## 3. Fila automática + mudanças na Hero (🟡 proposto, aguardando aprovação)

**Horário efetivo da fila.** Novo helper `lib/business-hours.ts` com `isAnyBarberOnShiftNow(admin, now)`: pega o `weekday` de agora, busca `barber_schedules` de todos os barbeiros ativos pra esse dia, checa se o horário atual cai dentro de alguma janela. Fila efetivamente aberta = `site_config.queue_open` (toggle manual) **e** `isAnyBarberOnShiftNow`. Entra em dois lugares:
- `getQueueBoard` (usado por `/admin/fila` e `/fila/tv`) — `queueOpen` passa a refletir o estado efetivo.
- `joinQueue` — recusa entrada também quando o horário já encerrou, mesmo com o toggle manual ainda em "aberta".

No `/admin/fila`, se o toggle manual estiver "aberto" mas o horário efetivo estiver fechado, mostrar aviso: "Fechada automaticamente — fora do horário de atendimento".

**Resumo do horário (texto da Hero).** Novo helper `summarizeOpeningHours(admin)`: pra cada dia da semana, junta as janelas de todos os barbeiros ativos (menor início, maior fim); dias sem nenhum barbeiro trabalhando ficam de fora. Agrupa dias consecutivos com o mesmo horário em faixas — ex. `"Seg a Sex: 09:00–18:00 · Sáb: 09:00–14:00"`. Intervalos de almoço não entram no resumo (só a janela externa do dia).

**Hero (`components/site/Hero.tsx`).** Dois botões lado a lado: "Agendar horário" (existente) e "Fila de atendimento" (novo, estilo secundário/outline, leva pra `/fila` sempre — a própria página já trata o caso de fila fechada). O texto de horário (resumo calculado) desce para uma linha abaixo dos dois botões.

## 4. Testes e validação (⬜ não escrito ainda)

Pendente — continuar na próxima sessão.

## Próximos passos

1. Aprovar seção 3.
2. Escrever seção 4 (plano de testes).
3. Fazer a auto-revisão do spec.
4. Usuário revisa o spec completo.
5. Transição para `writing-plans`.
