# Template de Site para Barbearias — Design (Fase 1)

**Data:** 2026-10-05
**Status:** Aprovado para planejamento

## Contexto

Lucca é freelancer e constrói sistemas de vendas/gestão sob medida para pequenos negócios locais. Este projeto não é para um cliente específico fechado — é um **produto/template próprio**, pensado para ser reaproveitado em futuras barbearias que ele venha a atender, seguindo o mesmo padrão de proposta/entrega que ele já usa (Fase 1 fechada, Fase 2 orçada depois).

O objetivo de negócio do sistema tem três frentes:
1. **Atrair clientes** — site de marketing da barbearia.
2. **Cliente agenda sozinho** — fluxo de agendamento sem fricção.
3. **Dono controla o negócio** — agendamentos, faturamento e planos mensais de assinatura.

## Modelo de operação do template

Repo único, **config-driven**, clonado manualmente por cliente (Abordagem A, recomendada e aprovada):

- Cada barbearia nova = clonar o repo, criar um projeto Supabase próprio, rodar um seed inicial (barbearia, serviços padrão, horários) e um deploy Vercel próprio.
- Identidade visual e dados do negócio (nome, logo, cores, endereço, horário, contato) ficam em uma tabela `site_config` editável pelo próprio dono no painel — não em env var fixa nem hardcoded.
- **Não é multi-tenant.** Cada instância atende uma única barbearia. Isolamento de dados entre clientes vem de serem projetos Supabase/Vercel completamente separados, não de lógica de tenant dentro do app.
- Uma CLI de scaffolding que automatize a criação de projeto Supabase + seed + deploy (Abordagem B) foi considerada e **descartada para este ciclo** — vale revisitar como investimento da operação do Lucca quando houver recorrência de clientes usando este template, não como parte do escopo deste produto.

## Arquitetura

Next.js (App Router) + Supabase (Postgres + Auth + Storage) + Vercel. Um único app com duas áreas:

- **Site público** (`/`, `/agendar`, `/cancelar`) — sem login, otimizado para conversão.
- **Painel admin** (`/admin/*`) — atrás de login único via Supabase Auth (apenas o dono tem conta; login individual por barbeiro fica fora do escopo da Fase 1).

Tabelas sensíveis (agendamentos, clientes, planos, notificações) não recebem escrita anônima via RLS. Toda escrita vinda do site público (criar agendamento, cancelar agendamento) passa por **Server Actions** do Next.js, que rodam no servidor, validam as regras de negócio e usam a service role do Supabase — o navegador do visitante nunca escreve direto nas tabelas sensíveis.

## Modelo de dados (resumo)

- `site_config` — singleton: nome, logo, cores, endereço, contato, horário geral, redes sociais.
- `barbers` — nome, foto, ativo.
- `barber_schedules` — horário semanal recorrente por barbeiro.
- `barber_time_off` — folgas/exceções pontuais por barbeiro.
- `services` — nome, duração, preço, ativo.
- `clients` — nome, telefone (identificador único do cliente; sem senha, sem login).
- `appointments` — cliente, barbeiro, serviço, data/hora, status (`agendado` / `concluído` / `cancelado` / `faltou`), origem (`online` / `avulso`).
- `plans` — nome, benefícios (ex: "4 cortes/mês"), preço mensal.
- `client_plans` — cliente, plano, data de início, vigência, status (`ativo` / `inadimplente` / `cancelado`), data do último pagamento registrado manualmente.
- `notifications` — tipo (ex: `cancelamento`), mensagem, referência ao agendamento, lida/não lida — alimenta o sininho do painel.

## Site público

### Home
Hero com CTA "Agendar horário", lista de serviços com preço, galeria de fotos, seção sobre a barbearia, horário de funcionamento, localização (mapa embed) e redes sociais. Todo o conteúdo vem de `site_config` / `services` / `barbers`, editável no painel.

### Agendamento (`/agendar`), sem login
1. Cliente escolhe o **serviço**.
2. Escolhe o **barbeiro** (ou "qualquer disponível").
3. Sistema calcula **horários livres** cruzando `barber_schedules` − `barber_time_off` − `appointments` existentes, considerando a duração do serviço escolhido.
4. Cliente informa **nome e telefone**.
5. Confirma → Server Action revalida que o horário ainda está livre (evita conflito de concorrência entre dois clientes agendando o mesmo horário ao mesmo tempo) e cria o `appointment` + `client` (upsert por telefone normalizado; se o telefone já existir, reaproveita o cadastro e atualiza o nome se vier diferente).
6. Tela de confirmação com resumo. Sem envio automático de WhatsApp/SMS (ver "Fora de escopo").

### Cancelamento (`/cancelar`), sem login
1. Cliente informa o **telefone** usado no agendamento.
2. Sistema lista os agendamentos futuros com status `agendado` vinculados a esse telefone.
3. Cada agendamento mostra se ainda pode ser cancelado: permitido apenas se **faltar mais de 3 horas** para o horário marcado (regra validada também no servidor, não só na UI).
4. Dentro da janela de 3h, o botão de cancelar fica desabilitado com mensagem orientando a entrar em contato direto com a barbearia.
5. Cancelamento muda o `appointment` para status `cancelado` e cria um registro em `notifications` para o dono ver no painel.

Não há token/link único de cancelamento — a consulta é sempre por telefone, para não depender do cliente guardar um link (já que não há envio automático de mensagem para reenviá-lo se perder).

## Painel administrativo

- **Login único** (Supabase Auth, email/senha do dono).
- **Dashboard**: faturamento do período (dia/semana/mês), nº de agendamentos, breakdown por barbeiro/serviço, sininho de notificações (cancelamentos e futuros tipos de evento) com contador de não lidas.
- **Agenda**: calendário com todos os agendamentos, filtro por barbeiro/dia; marcar status (`concluído` / `faltou` / `cancelado`); criar agendamento avulso (walk-in) direto no painel.
- **Clientes**: lista (nome, telefone, histórico de atendimentos, plano ativo se houver).
- **Planos**: CRUD de tipos de plano (nome, benefícios, preço mensal); atribuir plano a cliente; marcar pagamento mensal manualmente; sinalizar inadimplentes (sem bloqueio automático de agendamento — decisão fica com o dono).
- **Configurações do site**: editar serviços/preços, barbeiros e seus horários de trabalho, horário de funcionamento geral, dados de contato, fotos (Supabase Storage), identidade visual básica (cores/logo).

## Faturamento

Calculado automaticamente a partir dos `appointments` com status `concluído` (preço do serviço × atendimentos realizados no período). O dono pode lançar atendimentos avulsos direto no painel (sem passar pelo fluxo público), que entram no mesmo cálculo. Não há módulo de caixa/financeiro completo (sem controle de despesas ou vendas de produto) nesta fase.

## Planos mensais

Controle manual: o dono cadastra o cliente num plano e marca os pagamentos manualmente (pix/dinheiro combinados por fora). O sistema controla vigência e status (ativo/inadimplente/cancelado) e exibe isso no painel, mas não processa cobrança nem pagamento recorrente online.

## Regras e edge cases

- **Concorrência de horário:** a Server Action revalida no servidor que o slot ainda está livre antes de confirmar — evita double-booking.
- **Identificação do cliente:** telefone normalizado é a chave; mantém o nome mais recente informado.
- **Cancelamento:** só permitido com mais de 3h de antecedência, validado no servidor; gera notificação para o dono.
- **Plano inadimplente:** sinalizado no painel, sem bloqueio automático de agendamento.

## Fora de escopo (Fase 1)

- Login/conta do cliente final (agendamento e cancelamento são feitos por telefone, sem senha).
- Login individual por barbeiro (barbeiros são cadastrados como recursos da agenda, não como usuários do sistema).
- Notificação automática por WhatsApp/SMS para o cliente (confirmação é só na tela).
- Pagamento recorrente online dos planos mensais (gateway de pagamento, cobrança automática).
- Módulo financeiro/caixa completo (despesas, venda de produtos, gorjetas).
- CLI de scaffolding para automatizar a criação de novos clientes a partir do template.

Esses itens ficam como direção futura, a orçar/priorizar separadamente conforme a necessidade real surgir (seja de um cliente específico, seja da operação do próprio Lucca).

## Testes

Dado o perfil do projeto (sistema de negócio real, sem suíte de testes formal nos projetos anteriores do Lucca), a abordagem é leve:
- Testes unitários na lógica de cálculo de horários disponíveis (cruzamento de agenda do barbeiro, folgas e agendamentos existentes é a parte com mais risco de bug sutil).
- Verificação manual via navegador dos fluxos de agendamento, cancelamento e painel administrativo antes da entrega, sem exigir cobertura automatizada ampla.
