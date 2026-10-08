# Fila de Atendimento — Design

**Data:** 2026-10-07
**Status:** Aprovado para planejamento

## Contexto

O template (ver `docs/superpowers/specs/2026-10-05-barbearia-template-design.md`) hoje só resolve o lado "agendamento com hora marcada" (`/agendar`). Alguns clientes futuros — a começar pelo Barbearia Brothers (Thiago) — não trabalham com hora marcada: o cliente chega, entra numa fila de espera e é atendido por ordem de chegada (walk-in puro).

Este projeto continua sendo o **template/produto único** de Lucca (não um build fechado pro Thiago): a Fila é construída como um módulo a mais, convivendo no mesmo repo com o Agendamento já existente, sem remover ou enfraquecer nada do que já há. Quando Lucca cria o repo/projeto específico de um cliente que não usa agendamento, ele remove manualmente essa parte na hora de clonar — não é um toggle em runtime, é uma decisão tomada na criação do projeto do cliente.

**Premissa de escopo que simplifica bastante o design:** fila e agendamento nunca precisam coexistir *para o mesmo barbeiro, no mesmo dia*, dentro de uma loja. Cada barbearia-cliente ativa um módulo ou o outro. Por isso a Fila não cruza disponibilidade com `barber_schedules` / `barber_time_off` / `appointments` agendados — ela é operacionalmente independente.

## Modelo de dados

### Tabela nova: `queue_entries`

```sql
create table queue_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  service_id uuid not null references services(id),
  barber_id uuid references barbers(id), -- null = "qualquer disponível"
  status text not null default 'aguardando'
    check (status in ('aguardando','em_atendimento','concluido','cancelado')),
  created_at timestamptz not null default now(), -- também define a ordem de chegada
  started_at timestamptz,
  finished_at timestamptz
);

alter table queue_entries enable row level security;
-- Mesmo padrão de appointments: zero policy pra anon. Toda leitura/escrita
-- pública (entrar, consultar status, saiu da fila) passa por Server Actions
-- com o client admin (service role), nunca direto pela RLS de anon.
create policy "owner all queue_entries" on queue_entries for all to authenticated using (true) with check (true);
```

`barber_id` tem dupla função ao longo do ciclo de vida: enquanto `aguardando`, é a *preferência* do cliente (ou `null` = qualquer). No momento em que um barbeiro chama esse cliente, o campo é sobrescrito com o barbeiro que efetivamente atendeu — passa a ser o registro definitivo, igual a `appointments.barber_id`.

### Alteração em `appointments`

```sql
alter table appointments drop constraint appointments_origin_check;
alter table appointments add constraint appointments_origin_check
  check (origin in ('online','avulso','fila'));
```

Quando uma `queue_entry` é **finalizada**, o sistema cria automaticamente uma linha em `appointments`:

| `appointments` | valor |
|---|---|
| `client_id`, `barber_id`, `service_id` | copiados da `queue_entry` |
| `starts_at` | `queue_entry.started_at` |
| `ends_at` | `queue_entry.finished_at` |
| `status` | `'concluido'` |
| `origin` | `'fila'` |

Essa linha nunca passa por `status = 'agendado'`, então não interage com a exclusion constraint de overlap (`appointments_no_overlap`, que só vale pra `'agendado'`). Isso é o que faz **faturamento e os gráficos do dashboard existentes (RevenueByDayChart, BreakdownBarChart, PeriodFilter) funcionarem pra fila sem nenhuma lógica nova** — eles já leem de `appointments` por período/origem.

### `site_config`

```sql
alter table site_config add column queue_open boolean not null default false;
```

Toggle manual de abrir/fechar a fila, editado no painel admin.

## Busca de cliente por telefone (compartilhado entre Fila e Agendamento)

Nova Server Action, `getClientByPhone(phone: string): Promise<{ name: string } | null>`, usando o admin client — consulta `clients` por telefone normalizado (`lib/phone.ts`).

Usada em **dois lugares**:
- `/fila` (entrar na fila).
- `BookingWizard` (`/agendar`): o formulário de contato passa a pedir telefone **antes** do nome; ao sair do campo telefone (debounce/blur), chama `getClientByPhone` e, se encontrar, preenche o nome automaticamente (campo continua editável, pro caso de precisar corrigir). Se o telefone não tiver cadastro, o campo nome fica vazio pra digitar normal. Essa é a única mudança no fluxo de agendamento neste ciclo — o resto do wizard (serviço → barbeiro → data/hora) não muda.

## Tempo estimado de espera

Função pura nova, `lib/queue-wait.ts` (mesmo padrão de `lib/slots.ts`: cálculo isolado, testável sem banco), `estimateWaitMinutes`:

**Entrada:**
- lista de barbeiros ativos, cada um com o momento em que fica livre: `now` se não está atendendo ninguém da fila agora, ou `started_at + duração do serviço em atendimento` se está ocupado (clamp em `now` se já passou do previsto);
- lista de `queue_entries` em `aguardando`, ordenadas por `created_at`, cada uma com `barber_id` (preferência) e duração do serviço escolhido;
- a entrada alvo (pra quem queremos a estimativa).

**Lógica:** simulação gulosa — percorre a fila de espera em ordem de chegada; cada entrada é "encaixada" no barbeiro compatível (preferência específica, ou qualquer um se `barber_id` é null) que fica livre mais cedo; esse barbeiro tem seu horário de disponibilidade avançado pela duração do serviço daquela entrada. Quando a simulação chega na entrada alvo, o resultado é o horário em que o primeiro barbeiro compatível ficaria livre pra ela — a diferença pra `now` é o tempo estimado em minutos.

Exibido em dois lugares: `/fila/status` (a própria estimativa do cliente) e `/admin/fila` (estimativa ao lado de cada item da lista de espera).

Essa é uma aproximação (não considera atrasos reais, imprevistos) — suficiente pro uso prático, sem over-engineering.

## Fluxo público

### `/fila` — entrar na fila

1. Telefone (com busca automática de nome, ver seção acima) → nome → serviço → barbeiro ("qualquer disponível" ou um específico).
2. Se `site_config.queue_open = false`: página mostra aviso de fila fechada, formulário desabilitado.
3. Confirmar → Server Action: valida fila aberta, faz upsert de `client` por telefone (mesma lógica de `resolveAndCreateAppointment`), insere `queue_entry` com `status = 'aguardando'`.
4. Redireciona para `/fila/status`.

### `/fila/status` — acompanhar / saiu da fila

Sem token/link secreto — mesma filosofia do `/cancelar` já existente: consulta por telefone.

1. Cliente informa telefone → Server Action busca a `queue_entry` ativa (`aguardando` ou `em_atendimento`) mais recente pra esse telefone.
2. Mostra: posição (nº de pessoas `aguardando` na frente, por ordem de chegada — contagem simples, não filtra por preferência de barbeiro) e `estimateWaitMinutes`.
3. Se `em_atendimento`: mostra "você está sendo atendido".
4. Botão "Saí da fila" → `status = 'cancelado'`.
5. Página faz polling leve (a cada 3-5s) só pra atualizar a própria posição/estimativa — isso não afeta o formulário de entrada em `/fila`, que é uma página separada e só escreve uma vez.

### `/fila/tv` — painel de parede

Rota pública, sem login, somente leitura. Pensada pra ficar aberta o dia inteiro no navegador de uma smart TV na loja.

Mostra: quem cada barbeiro está atendendo agora, e a lista de espera com nome, serviço e tempo estimado. Nenhuma informação sensível (sem telefone) — o mesmo que já é visível fisicamente pra quem está na loja.

Atualiza via polling a cada 3-5s.

## Painel admin — `/admin/fila`

Mesma lógica de board por colunas do `AgendaBoard` atual, uma coluna por barbeiro ativo:

- **Ocupado:** mostra o cliente em `em_atendimento` (nome, serviço, horário que começou) + botão "Finalizar atendimento".
- **Livre:** mostra botão "Chamar próximo" — busca a primeira `queue_entry` em `aguardando` (por `created_at`) com `barber_id` nulo ou igual a esse barbeiro; marca `status = 'em_atendimento'`, `started_at = now()`, grava esse barbeiro em `barber_id`.
- **Finalizar atendimento** → `status = 'concluido'`, `finished_at = now()`, cria a linha em `appointments` (seção acima), libera a coluna pra chamar o próximo.
- Lista lateral com todos os `aguardando` (nome, serviço, preferência de barbeiro, tempo estimado) — remoção manual (no-show) seta `status = 'cancelado'`.
- Toggle "Fila aberta/fechada" no topo, escrevendo em `site_config.queue_open`.

Barbeiros usam o mesmo login único do dono pra acessar essa página do próprio celular (sem autenticação por barbeiro nesta fase — login individual fica pra depois, é decisão já tomada e registrada).

**Atualização entre dispositivos:** toda ação que muda a fila (entrar, sair, chamar, finalizar) já revalida o cache do servidor imediatamente, então quem agiu vê o resultado na hora. `/admin/fila`, `/fila/status` e `/fila/tv` fazem polling (3-5s) só pra ler esse estado já revalidado — uma mudança feita em outro aparelho aparece em até ~5s, sem precisar de WebSocket/Supabase Realtime.

## Fora de escopo (YAGNI deste ciclo)

- Sem notificação no sininho ao entrar na fila — o board em tempo (quase) real já cobre a necessidade; notificações continuam só pra cancelamento de agendamento, como hoje.
- Sem Supabase Realtime/WebSocket — polling de 3-5s é suficiente pro caso de uso (fila física, não um app de delivery).
- Sem login individual por barbeiro — mesma conta única do dono, como o resto do painel.
- Sem decomposição do agendamento — `/agendar` e sua lógica de slots continuam intocados, exceto a reordenação telefone-antes-do-nome com autofill.

## Testes

Seguindo o padrão leve já adotado no projeto: teste unitário pra `estimateWaitMinutes` (a parte com mais risco de bug sutil, igual ao cálculo de slots), verificação manual via navegador do fluxo completo (entrar na fila, acompanhar status, chamar/finalizar no painel, ver atualização na TV) antes de considerar pronto.
