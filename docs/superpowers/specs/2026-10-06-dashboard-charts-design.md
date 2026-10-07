# Painel Admin — Dashboard com Gráficos, Período e Dados de Demonstração — Design

**Data:** 2026-10-06
**Status:** Aprovado para planejamento

## Contexto

O Dashboard (`/admin`, `app/admin/page.tsx`) hoje só mostra o mês corrente, sem seletor de período, e os breakdowns "Por serviço"/"Por barbeiro" são listas de texto. O spec original do produto já previa um seletor dia/semana/mês (`docs/superpowers/specs/2026-10-05-barbearia-template-design.md`, linha 71). O dono pediu três coisas: dados fictícios pra ver o Dashboard "vivo", gráficos em vez de listas, e filtro de período.

## Escopo

**Dentro desta rodada:**
- Filtro de período (Hoje / Semana / Mês, padrão Mês) controlando todo o Dashboard.
- Gráfico de barras verticais: faturamento por dia dentro do período selecionado.
- Gráfico de barras horizontais substituindo as listas "Por serviço" e "Por barbeiro".
- `supabase/demo-seed.sql`: script separado do seed do template, gera ~28 dias de agendamentos fictícios variados pra popular os gráficos em dev.

**Fora de escopo:**
- Intervalo de datas customizável (só os 3 presets).
- Qualquer biblioteca de gráficos externa — os 3 gráficos são SVG artesanal, sem dependência nova.
- Mudanças em "Próximos agendamentos" (continua lista, não é um gráfico).
- Rodar o `demo-seed.sql` automaticamente em algum pipeline — é manual, só pro ambiente de dev do Lucca.

## Dados

### `lib/admin-data.ts` — substitui `getMonthSummary` por `getPeriodSummary`

```ts
export type Period = "today" | "week" | "month";

export type DaySummary = { date: string; revenueCents: number };

export type PeriodSummary = {
  revenueCents: number;
  appointmentCount: number;
  completedCount: number;
  byService: BreakdownRow[];
  byBarber: BreakdownRow[];
  byDay: DaySummary[];
};

export async function getPeriodSummary(period: Period): Promise<PeriodSummary>
```

`byDay` inclui **todo dia do período**, mesmo com faturamento zero (necessário pra desenhar o eixo do gráfico de barras sem buracos). `today`/`week`/`month` usam limites calculados em hora local (mesmo padrão de `getDayAgenda`: `new Date(ano, mês, dia)` em vez de UTC), com `week` começando no domingo (consistente com `weekday` 0=domingo já usado em `barber_schedules`).

`getMonthSummary`, `MonthSummary` e `startOfMonth` são removidos — `app/admin/page.tsx` é o único consumidor.

## UI

### `app/admin/page.tsx`

Lê `?period=` da query string (`today`/`week`/`month`, default `month`), chama `getPeriodSummary(period)`. O rótulo "Este mês" vira dinâmico conforme o período ("Hoje" / "Esta semana" / "Este mês").

### `components/admin/PeriodFilter.tsx` (novo, Server Component)

3 `<Link>` (`/admin?period=today|week|month`), mesmo padrão visual das opções selecionáveis do `BookingWizard`: borda `ink-line` em repouso, borda `gold` + fundo `ink-raised` quando ativo (`aria-current="page"` no ativo).

### `components/admin/RevenueByDayChart.tsx` (novo, Server Component, SVG)

Barras verticais, uma por entrada de `byDay`. Barra única em dourado (série única → sem legenda, por regra do dataviz: *"a single series needs no legend box"*). Espessura de barra ≤24px com gap de 2px entre barras (`marks-and-anatomy.md`), topo arredondado 4px, base quadrada na baseline. Rótulo direto (valor) só quando `byDay.length <= 7` (Hoje/Semana) — em Mês (até 31 barras) o valor vai só no `<title>` SVG nativo (tooltip no hover, zero JS) pra não poluir. Eixo X mostra o dia (`DD` ou abreviação de dia da semana conforme o período); sem eixo Y numérico explícito — o valor está no tooltip e no rótulo quando couber.

### `components/admin/BreakdownBarChart.tsx` (novo, Server Component, SVG, reutilizado por Por Serviço e Por Barbeiro)

Recebe `rows: BreakdownRow[]`. Barras horizontais, comprimento proporcional ao `revenueCents` de cada linha (maior = mais larga), mesmo dourado único. Nome da categoria à esquerda (texto, token `paper`), contagem (`Nx`) e valor formatado na ponta da barra (texto, nunca a cor da série — regra do dataviz: *"text never wears the data color"*). Substitui as duas `<ul>` atuais; mantém o mesmo estado vazio ("Nenhum atendimento concluído neste período ainda.").

## Dados de demonstração

`supabase/demo-seed.sql` (novo arquivo, cabeçalho deixando claro que não é o seed do template e deve rodar só manualmente num projeto de dev):

- Insere 5 clientes fictícios (`Cliente Demo 1..5`, telefones `119000000{1..5}`, `on conflict (phone) do nothing` pra rodar mais de uma vez sem duplicar).
- Gera agendamentos pros últimos 28 dias + próximos 6 dias, 2 horários por dia (10:00 e 15:30), ciclando pelos barbeiros/serviços **já ativos no banco** (não cria barbeiro/serviço novo — assume que `supabase/seed.sql` ou cadastro manual já rodou).
- Status: dias futuros → `agendado`; dias passados → `concluido` na maioria, com uma fração pequena `cancelado`/`faltou` pra variedade (via módulo no contador de linha, não aleatório — resultado determinístico, reproduzível).
- `origin: 'avulso'` pra todas (não é um agendamento online real).
- Assume pelo menos 1 barbeiro ativo, 1 serviço ativo — documentado no cabeçalho do arquivo; não roda seed do zero.

## Testes e verificação

- Nenhuma lógica pura nova digna de teste automatizado além da função de intervalo de datas (`periodRange`), que tem risco real de off-by-one (domingo vs segunda, limite de hoje) — essa função ganha teste unitário em `lib/admin-data.test.ts` (primeiro arquivo de teste pra esse módulo; os outros helpers de `admin-data.ts` continuam sem teste, mesmo padrão já estabelecido).
- Verificação manual: rodar `demo-seed.sql` no dev, conferir contagem de linhas inseridas, abrir `/admin` nos 3 períodos e confirmar que os gráficos batem com os números das seções ao lado, testar o período "Hoje" num dia sem agendamentos (estado vazio do gráfico).
