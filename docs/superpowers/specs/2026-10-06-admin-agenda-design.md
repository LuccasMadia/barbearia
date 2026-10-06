# Painel Admin — Agenda — Design

**Data:** 2026-10-06
**Status:** Aprovado para planejamento

## Contexto

O painel admin (`/admin`) hoje só tem o Dashboard: resumo do mês corrente (faturamento, nº de agendamentos, breakdown por serviço/barbeiro) e uma lista somente-leitura dos próximos agendamentos. Não existe nenhuma forma de agir sobre um agendamento — nenhuma tela marca um agendamento como `concluído`, e o faturamento do dashboard só soma agendamentos com esse status, então ele fica permanentemente zerado sem essa peça.

O spec original do produto (`docs/superpowers/specs/2026-10-05-barbearia-template-design.md`) já previa uma seção **Agenda** no painel: "calendário com todos os agendamentos, filtro por barbeiro/dia; marcar status (concluído/faltou/cancelado); criar agendamento avulso (walk-in) direto no painel." Esta é a primeira fatia do painel admin a ser construída além do Dashboard — as próximas (Clientes & Planos, Configurações do site) ficam para specs futuras.

## Escopo

**Dentro desta rodada:**
- Nova rota `/admin/agenda`: visão de um dia por vez, uma coluna por barbeiro ativo, navegação dia a dia (← hoje →).
- Marcar status de um agendamento (`concluído` / `faltou` / `cancelado`) com botões inline no próprio bloco.
- Criar agendamento avulso (walk-in) clicando num horário livre na coluna de um barbeiro.

**Fora de escopo (fica para depois):**
- Editar ou reagendar um agendamento já existente (trocar horário/barbeiro/serviço).
- Arrastar e soltar para reagendar.
- Sininho de notificações de cancelamento.
- Seletor de período no Dashboard (dia/semana/mês).
- Filtro "ver todos os barbeiros vs. um barbeiro" (todas as colunas aparecem sempre nesta primeira versão).

## Layout

Visão de dia único, uma coluna por barbeiro ativo (aprovado via comparação visual com as alternativas "lista cronológica" e "calendário mensal"). Cabeçalho com a data do dia e setas para navegar; cada coluna mostra os horários de trabalho do barbeiro naquele dia, com os agendamentos encaixados nos horários certos e os intervalos livres visíveis e clicáveis.

## Camada de dados

### `lib/admin-data.ts` — `getDayAgenda(date: string)`

Busca, para o dia informado:
- Barbeiros ativos (`barbers` onde `active = true`).
- Horário de trabalho de cada um naquele dia da semana (`barber_schedules`) e folgas (`barber_time_off`), para montar a grade de horários disponíveis — reaproveita `lib/slots.ts` (mesma função usada pelo `/agendar`) para não duplicar a lógica de cálculo de disponibilidade.
- Todos os agendamentos do dia para esses barbeiros, **qualquer status** (ao contrário do Dashboard, que só olha `concluído`, e do `getUpcomingAppointments`, que só olha `agendado`), com nome do cliente e serviço já resolvidos.

Retorna uma estrutura por barbeiro: `{ barberId, barberName, slots: [{ time, appointment | null }] }`, onde cada slot é ou um agendamento existente (com id, cliente, serviço, status, origem) ou `null` (horário livre e clicável).

### `app/admin/agenda/actions.ts` — duas Server Actions novas

- **`updateAppointmentStatus(appointmentId: string, status: "concluido" | "faltou" | "cancelado")`**: só permite a transição a partir de `agendado` (um agendamento já concluído/cancelado não mostra mais os botões). Faz o update e revalida a rota `/admin/agenda`.
- **`createWalkInAppointment(input: { barberId, serviceId, startsAtIso, name, phone })`**: variação do `createAppointment` existente em `app/agendar/actions.ts`. Reaproveita a mesma validação (recalcula os slots livres do barbeiro no servidor e confere que o horário pedido ainda está livre, mesmo tratamento de conflito de concorrência via exclusion constraint do Postgres) e o mesmo upsert de cliente por telefone normalizado. Diferenças: barbeiro já vem fixo (não aceita `"any"`, pois veio do clique numa coluna específica), e grava `origin: "avulso"` em vez de `"online"`.

Para evitar duplicar a lógica de validação entre os dois arquivos de actions, a função interna `computeBarberSlots` de `app/agendar/actions.ts` é extraída para um helper compartilhado (ex: `lib/slots-server.ts`) que ambos os arquivos importam.

## UI (Server Components + Client Components pontuais)

- **`app/admin/agenda/page.tsx`** (Server Component): lê `date` da query string (default: hoje), chama `getDayAgenda`, renderiza o cabeçalho de navegação e as colunas.
- **`DayNav`** (Client Component pequeno): setas ← → que navegam trocando a query string `date`.
- **`BarberColumn`**: lista os slots de um barbeiro. Cada slot é:
  - **Ocupado por agendamento `agendado`**: mostra horário, nome do cliente, serviço, origem (badge sutil "avulso" quando aplicável), e os 3 botões inline de status. Cada botão chama `updateAppointmentStatus` diretamente (Server Action ligada a um `<form>`, sem precisar de estado client-side).
  - **Ocupado por agendamento `concluído`/`faltou`/`cancelado`**: mostra os mesmos dados, sem botões, com indicação visual sutil do status (cor/ícone).
  - **Livre**: área clicável que abre o formulário de walk-in.
- **`WalkInForm`** (Client Component, modal ou painel lateral): abre com barbeiro e horário já fixos (vindos do slot clicado); pede serviço (select), nome e telefone do cliente; ao confirmar, chama `createWalkInAppointment` e fecha mostrando erro inline se o horário deixou de estar livre (mesma race condition que o `/agendar` já trata).

## Regras de negócio

- **Sem bypass de disponibilidade**: o walk-in passa pela mesma validação server-side de conflito que o fluxo público. O painel não tem um "modo forçar", para não gerar overlap de agendamentos mesmo vindo do dono.
- **Telefone obrigatório no walk-in**: mantém consistência com o modelo de dados (cliente = telefone). Mesmo um walk-in de balcão entra no cadastro de clientes e aparece no histórico depois.
- **Transição de status é de mão única**: uma vez marcado `concluído`/`faltou`/`cancelado`, não há botão para voltar a `agendado` nesta rodada (reduz escopo; reverter erro de clique fica para uma iteração futura se virar necessidade real).

## Testes e verificação

- Nenhuma lógica nova de cálculo de horário é introduzida (reaproveita `lib/slots.ts`, já testado); o helper extraído (`lib/slots-server.ts`) não precisa de testes novos além dos que já cobrem `lib/slots.ts`.
- Verificação manual via navegador: marcar status nos três sentidos, criar um walk-in de ponta a ponta, tentar criar um walk-in num horário que ficou ocupado entre o carregamento da página e o clique (forçar a race condition manualmente) e confirmar que a mensagem de erro aparece em vez de duplicar o agendamento.
