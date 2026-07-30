# Roadmap de Inovação — Portal de Chamados 2.0

> Resultado de pesquisa em 5 frentes (benchmark SaaS, UX para usuário leigo,
> produtividade do técnico, IA aplicada, design visual 2026) sintetizada em
> 21/07/2026. Protótipo navegável das telas foi apresentado junto com este doc.

## A visão

O portal deixa de ser "um site onde se abre chamado" e vira o **iFood/Correios
da TI da prefeitura**: a recepcionista tira uma foto do problema, responde uma
pergunta por tela, recebe um protocolo verde grande e acompanha tudo num
rastreador de etapas que ela já sabe ler — com aviso no celular quando o
técnico responde. O técnico trabalha num cockpit estilo Linear: filas com
contadores, semáforo de SLA, kanban de arrastar e IA barata (centavos/mês) que
classifica, resume e sugere respostas — sempre com humano no controle. Tudo
sem banco próprio (GLPI segue a fonte da verdade), sem libs pesadas, leve no
1 vCPU: a sensação de "app premium" vem de CSS puro, optimistic UI e recursos
nativos do Next 15/React 19.

## Fase A — Quick wins (dias de trabalho cada)

1. **Rastreador estilo "encomenda dos Correios"** no detalhe do chamado —
   stepper CSS puro mapeando os status do GLPI em etapas leigas
   (Recebido → Técnico cuidando → Aguardando você → Resolvido → Encerrado),
   com datas reais e previsão via `time_to_resolve`. Versão mínima nos cards
   de "meus chamados". Cores de tag padronizadas em todo o portal
   (azul=novo, âmbar=aguardando você, verde=resolvido, cinza=fechado).
2. **Linguagem simples + acessibilidade** — `lib/copy.ts` como fonte única de
   strings, zero jargão ITIL ("Followup"→"Mensagem"); alvos de toque ≥44px,
   inputs 16px (não dispara zoom iOS), focus-visible em tudo.
3. **Página de confirmação verde** pós-abertura com protocolo em fonte grande,
   "o que acontece agora" em 3 linhas e micro-celebração CSS (checkmark
   animado; respeita `prefers-reduced-motion`).
4. **Foto direto da câmera** com compressão no cliente via canvas
   (`capture="environment"`, 5 MB → ~200 KB, zero libs).
5. **Velocidade percebida** — skeletons com a forma real do conteúdo
   (`loading.tsx` por rota), `useOptimistic` (React 19) em comentários e
   aprovação, componente global de toast.
6. **Filas inteligentes do técnico** — chips com contador (Minha fila / Não
   atribuídos / Vencendo hoje / Aguardando aprovação), semáforo de SLA
   (borda verde/âmbar/vermelha + "vence em 2h") derivado no cliente.
7. **CSAT de 1 clique** — 5 emojis no momento da aprovação da solução, gravado
   no `TicketSatisfaction` nativo do GLPI; alimenta os relatórios.

## Fase B — Médio prazo (1–2 semanas cada)

1. **Wizard de abertura GOV.UK** — uma pergunta por tela + revisão
   "confira antes de enviar"; ditado por voz (Web Speech API pt-BR).
2. **Home reordenada + bottom tab bar mobile** — chamados ativos primeiro,
   cards de categoria com exemplos concretos, empty states com ação.
3. **Notificações em 3 camadas** — sino com badge (polling 60s só com aba
   visível, `date_mod` vs `lastSeen`), dropdown de avisos, toasts.
4. **IA na abertura** (Claude Haiku via API, ~US$2-3/mês): triagem
   categoria+urgência enquanto digita, detecção de duplicado/incidente em
   massa, sugestão de solução (deflexão não-bloqueante com FAQs curados).
5. **Cockpit do técnico** — kanban drag-and-drop (Pragmatic DnD ~4,7KB, única
   lib nova justificada), triagem inbox-zero com 1 tecla, atalhos estilo
   Linear (J/K/I/G+letra), command palette Ctrl+K artesanal.
6. **Fundação visual** — tokens semânticos em duas camadas (Tailwind 4),
   dark mode com paleta de gráficos própria validada
   (claro: `#2a78d6 #eda100 #4a3aa7 #008300 #1baf7a`;
   escuro: `#2a78d6 #bd7f00 #6153c4 #008300 #1baf7a`),
   Inter variável via `next/font`, `tabular-nums` nos números.

## Fase C — Apostas (1 mês+ cada)

1. **PWA instalável + push** "o técnico respondeu" — manifest nativo do Next,
   convite contextual na página de confirmação, web-push com VAPID
   (subscriptions em arquivo/SQLite local — dado do portal, não do serviço).
2. **Copiloto IA do técnico** — resumir chamado longo (salvo como followup
   privado no GLPI = cache na fonte da verdade), sugerir resposta em
   linguagem simples (sempre rascunho com selo, nunca envio automático),
   job mensal que gera artigos de KB a partir de soluções recorrentes.
3. **Relatórios 2.0** — bento grid com KPI hero, sparklines, CSAT e deflexão
   como novos KPIs, "Analisar período" com resumo executivo narrado por IA
   (~US$0,002/relatório), incluído no PDF.

## Não fazer (decidido por pesquisa, com motivo)

- **Chatbot conversacional de IA** — frustra usuário leigo; deflexão
  não-bloqueante entrega o mesmo resultado sem fricção.
- **WebSocket/SSE** — polling de 60s resolve no nosso volume; conexões
  persistentes é o que o 1 vCPU não comporta.
- **Libs de UI/animação/gráfico** (cmdk, dnd-kit, canvas-confetti, Chart.js,
  Lottie…) — tudo sai com CSS/SVG puro + `useOptimistic` + View Transitions;
  exceção única: Pragmatic DnD para o kanban touch.
- **Glassmorphism generalizado / aurora / neubrutalismo** — data em ~18 meses
  e trava desktop antigo; glass restrito a 1 elemento (header sticky).
- **Banco próprio para dados de negócio** — GLPI é a fonte da verdade;
  exceções operacionais: subscriptions de push e cache de embeddings.
- **Envio automático de resposta de IA** — IA só produz rascunho com selo;
  humano sempre revisa.
- **App nativo** — PWA + push web cobre o caso sem loja nem build duplo.
- **Gamificação para usuário final** — servidor abre chamado por necessidade;
  única celebração que faz sentido é o micro-feedback de sucesso.
