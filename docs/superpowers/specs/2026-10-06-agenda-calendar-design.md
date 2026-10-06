# Painel Admin — Calendário na Agenda — Design

**Data:** 2026-10-06
**Status:** Aprovado para planejamento

## Contexto

`/admin/agenda` (ver `docs/superpowers/specs/2026-10-06-admin-agenda-design.md`) hoje mostra direto o dia atual, com colunas por barbeiro e setas `← Anterior` / `Próximo →` pra navegar um dia de cada vez. Pular pra uma data distante exige clicar a seta repetidas vezes. O dono pediu um calendário pra escolher o dia diretamente.

## Escopo

**Dentro desta rodada:**
- `/admin/agenda` passa a mostrar um calendário do mês, com a contagem de agendamentos de cada dia.
- Clicar num dia do calendário leva ao painel de colunas por barbeiro já existente, agora em `/admin/agenda/[date]`.
- Navegação entre meses no calendário (`‹ ›`), sem restringir meses passados — o dono pode revisar histórico.
- Link de volta ao calendário a partir do painel de dia.

**Fora de escopo:**
- Qualquer mudança no painel de colunas por barbeiro em si (ações de status, walk-in) — comportamento idêntico ao já implementado, só muda a URL que o acessa.
- Indicadores mais ricos no calendário (ex: breakdown por status, cor por ocupação) — só a contagem total do dia.

## Rotas

- **`/admin/agenda`** (Server Component, substitui o atual): lê `?month=AAAA-MM` da query string (default: mês atual), busca a contagem de agendamentos por dia via `getMonthAgendaSummary`, renderiza o grid do mês. Cada dia com `count > 0` mostra o número; dias com zero não mostram nada. O dia de hoje ganha uma borda sutil (`border-gold`) pra orientação visual. Cada célula de dia é um `<Link href="/admin/agenda/{date}">`. Setas de mês são `<Link href="/admin/agenda?month={prevOrNext}">`, sem desabilitar meses passados.
- **`/admin/agenda/[date]`** (Server Component, movida da atual `/admin/agenda?date=...`): conteúdo idêntico ao que já existe hoje — `DayNav` com setas e `AgendaBoard` com as colunas por barbeiro. `DayNav` ganha um link extra "← Calendário" que volta pra `/admin/agenda?month={mês do date atual}`.

## Dados

Nova função em `lib/admin-data.ts`:

```ts
export async function getMonthAgendaSummary(month: string): Promise<Record<string, number>>
```

`month` no formato `AAAA-MM`. Busca todos os agendamentos (qualquer status, igual à Agenda — não só `concluído` como o Dashboard) com `starts_at` dentro do mês, agrupa por dia (`AAAA-MM-DD`) e retorna a contagem. Uma query só, sem reaproveitar `buildDayTimeline` (que é por barbeiro/dia, não serve pro agregado do mês inteiro).

## Componente

`components/admin/AgendaMonthCalendar.tsx` — novo, Server Component (sem `"use client"`, navegação só por `<Link>`, como o `DayNav` já faz hoje). Recebe `month: string` e `summary: Record<string, number>`, renderiza o grid 7 colunas com os mesmos tokens visuais do `MonthCalendar` público (mesmas classes de dia circular, `bg-gold`/`text-gold-ink` pro dia selecionado — aqui não há "selecionado", mas o dia de hoje usa destaque equivalente). Não reaproveita o componente público porque esse é controlado (`value`/`onChange`, desabilita passado) e o novo é navegação pura por URL com contagem — APIs incompatíveis o suficiente pra justificar um componente separado em vez de inflar o público com props condicionais.

## Testes e verificação

Nenhuma lógica pura nova digna de teste automatizado (é fetch + agrupamento simples, mesmo padrão não-testado de `getDayAgenda`/`getUpcomingAppointments`). Verificação manual: abrir `/admin/agenda`, conferir contagem bate com os agendamentos reais do mês, navegar entre meses (incluindo um mês passado), clicar num dia e confirmar que cai no painel de colunas certo, voltar pelo link "← Calendário".
