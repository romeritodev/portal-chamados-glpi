import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { lerConfig, type ConfigPortal } from "./config-portal";

/**
 * Camada de IA do portal (roadmap Fase B).
 *
 * Dois caminhos, escolhidos na tela ⚙️:
 *  - "anthropic": SDK oficial da Anthropic (Claude).
 *  - "openai":    qualquer serviço compatível com a API da OpenAI
 *                 (OpenAI, Gemini, Groq, DeepSeek, OpenRouter, Ollama local…),
 *                 via HTTP direto no endpoint /chat/completions.
 *
 * A chave nunca sai do servidor. Toda falha é devolvida como mensagem legível
 * — nenhuma tela do portal pode quebrar porque a IA está fora do ar.
 */

export interface RespostaIA {
  ok: boolean;
  texto?: string;
  erro?: string;
  /**
   * O modelo bateu no teto de tokens e parou no meio da frase.
   *
   * Vale ouro saber disso: modelos com raciocínio interno (Gemini 3.x, o3)
   * gastam o MESMO orçamento pensando antes de escrever, e quanto pensam
   * varia a cada chamada. Sem esta bandeira, o texto cortado chega ao técnico
   * parecendo resposta pronta — foi o que aconteceu em produção.
   */
  truncado?: boolean;
}

const TIMEOUT_MS = 20_000;

function baseUrlNormalizada(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function chamaAnthropic(c: ConfigPortal, prompt: string, maxTokens: number): Promise<RespostaIA> {
  const client = new Anthropic({ apiKey: c.iaChave, timeout: TIMEOUT_MS, maxRetries: 1 });
  const resposta = await client.messages.create({
    model: c.iaModelo,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const texto = resposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { ok: true, texto, truncado: resposta.stop_reason === "max_tokens" };
}

async function chamaOpenAICompat(c: ConfigPortal, prompt: string, maxTokens: number): Promise<RespostaIA> {
  const base = baseUrlNormalizada(c.iaBaseUrl);
  if (!base) return { ok: false, erro: "Informe o endereço do serviço (base URL)." };

  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.iaChave}`,
      },
      body: JSON.stringify({
        model: c.iaModelo,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controlador.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const detalhe = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, erro: `O serviço respondeu HTTP ${res.status}. ${detalhe}`.trim() };
    }
    const dados = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const escolha = dados.choices?.[0];
    const texto = escolha?.message?.content?.trim();
    if (!texto) return { ok: false, erro: "O serviço respondeu num formato inesperado." };
    return { ok: true, texto, truncado: escolha?.finish_reason === "length" };
  } finally {
    clearTimeout(timer);
  }
}

/** Uma pergunta simples ao modelo configurado. Nunca lança. */
export async function perguntaIA(prompt: string, maxTokens = 512): Promise<RespostaIA> {
  const c = await lerConfig();
  return perguntaComConfig(c, prompt, maxTokens);
}

/** Igual, mas com uma config avulsa — usado pelo botão "Testar conexão". */
export async function perguntaComConfig(
  c: ConfigPortal,
  prompt: string,
  maxTokens = 512,
): Promise<RespostaIA> {
  if (c.iaProvedor === "desligado") return { ok: false, erro: "A IA está desligada nas configurações." };
  if (!c.iaChave) return { ok: false, erro: "Nenhuma chave configurada." };
  if (!c.iaModelo.trim()) return { ok: false, erro: "Informe o modelo." };

  try {
    return c.iaProvedor === "anthropic"
      ? await chamaAnthropic(c, prompt, maxTokens)
      : await chamaOpenAICompat(c, prompt, maxTokens);
  } catch (err) {
    return { ok: false, erro: mensagemDeErro(err) };
  }
}

/**
 * Melhora o texto que o técnico escreveu, sem inventar nada.
 *
 * A REGRA QUE IMPORTA: pode EXPLICAR à vontade, não pode ACRESCENTAR FATO.
 *
 * Detalhar é o serviço aqui — o técnico escreve simples e quer o texto
 * técnico e claro de volta, sem limite de tamanho. O que não se admite é o
 * modelo "completar" o atendimento com procedimentos plausíveis (limpeza
 * interna, teste de memória, verificação de drivers): isso vira registro
 * oficial de serviço que talvez ninguém tenha feito, num chamado de
 * prefeitura que pode ser auditado. Explicar o que ele fez, sim; dizer que
 * fez outra coisa, nunca.
 *
 * Também não pedimos saudação nem assinatura: o portal já mostra a foto, o
 * nome de quem escreveu e a data em cada mensagem.
 */
export async function melhorarTexto(
  rascunho: string,
  contexto: { titulo: string; problema: string },
  modo: "solucao" | "resposta",
): Promise<RespostaIA> {
  // O público muda conforme o campo, e com ele o registro da escrita.
  // A SOLUÇÃO é documento: vira relatório impresso, histórico do equipamento
  // e prova em auditoria. A RESPOSTA é conversa: alguém esperando notícia.
  // Escrever as duas do mesmo jeito estraga uma das duas.
  const contextoDeUso =
    modo === "solucao"
      ? [
          "Melhore o REGISTRO DA SOLUÇÃO do chamado.",
          "",
          "Este texto é DOCUMENTAÇÃO OFICIAL. Ele fica no histórico do",
          "equipamento, entra em relatório impresso de atendimentos e pode ser",
          "conferido em auditoria meses depois. Além disso o usuário lê para",
          "confirmar se foi resolvido. Escreva completo e organizado, como",
          "registro técnico — não como recado.",
          "",
          "ESTRUTURA:",
          "a) um parágrafo dizendo qual era a causa do problema;",
          "b) a frase 'Para solucionar o problema, foram realizadas as",
          "   seguintes ações:' seguida dos tópicos começados por '- ', um por",
          "   linha, SEMPRE que houver DUAS OU MAIS ações. Num registro que vai",
          "   para relatório, a lista é o que se confere de relance — só",
          "   atendimento de ação única fica em parágrafo;",
          "c) uma frase final com o resultado — SOMENTE se o rascunho disser",
          "   qual foi (teste feito, velocidade medida, equipamento voltando a",
          "   funcionar). Se o técnico não escreveu resultado nenhum, termine",
          "   na última ação e não invente desfecho.",
        ]
      : [
          "Melhore a RESPOSTA do técnico ao usuário.",
          "",
          "Quem vai ler é um servidor público sem conhecimento técnico, que",
          "está esperando notícia do chamado dele. Escreva direto e claro,",
          "como quem explica para um colega — sem estrutura de relatório.",
        ];

  const prompt = [
    "Você ajuda um técnico de TI de uma prefeitura a escrever melhor.",
    "",
    ...contextoDeUso,
    "",
    "REGRAS OBRIGATÓRIAS:",
    "1. NÃO invente FATO. É proibido acrescentar procedimento, teste, peça,",
    "   marca, causa, prazo ou resultado que não esteja no rascunho.",
    "   MAS PODE EXPLICAR: dizer o que cada coisa é, para que serve e por que",
    "   aquilo resolveu o problema é justamente o seu trabalho. A diferença:",
    "   'também limpei o cooler' (o técnico não disse — proibido) contra",
    "   'o roteador ficou ao lado da tela, o que encurta o caminho do sinal'",
    "   (explica o que ele já contou — desejável).",
    "2. NÃO descarte nada. Marca, modelo, número de série ou patrimônio, nome",
    "   do sistema, setor, sala, velocidade, quantidade, e o nome OU O CARGO",
    "   de quem aparecer (a professora, a servidora do RH) DEVEM continuar no",
    "   texto final. Isto é registro oficial: 'trocamos o toner' não diz de",
    "   qual impressora se trata, e 'o notebook' não diz quem estava usando.",
    "   Resumir jogando fora esses detalhes é tão ruim quanto inventar.",
    "3. Pode corrigir ortografia e pontuação, organizar a ordem das ideias,",
    "   completar frases cortadas e trocar gíria por palavra clara.",
    "4. Pode acertar a grafia de unidades técnicas mantendo o número igual",
    "   (100mb vira 100 Mbps, 8gb vira 8 GB). Nunca altere o valor.",
    "5. Explique termos técnicos que aparecerem, em poucas palavras e entre",
    "   parênteses, sem tirar o termo original.",
    "6. Só com UMA ação escreva em parágrafo — lista de um item só é pior que",
    "   texto corrido.",
    "6b. UM TÓPICO POR AÇÃO REAL. Não desmembre uma ação em várias para a",
    "    lista parecer maior: 'instalado e configurado um roteador' é UM",
    "    tópico, não 'Instalação' mais 'Configuração'. Relatório de",
    "    atendimento inflado engana quem for conferir depois.",
    "6c. Não acrescente adjetivo nem sintoma que o técnico não usou. Se ele",
    "    escreveu 'sinal fraco', não vire 'oscilação e enfraquecimento do",
    "    sinal' — oscilar é outro defeito, e ninguém observou isso.",
    "7. Não conclua nem prometa nada além do que está escrito. 'Agora está",
    "   funcionando perfeitamente' e 'a conexão ficou estável e de alto",
    "   desempenho' são conclusões do redator, não fatos do atendimento —",
    "   proibidas. Já 'o teste via cabo atingiu 100 Mbps' pode entrar, porque",
    "   o técnico mediu.",
    "8. Sem 'Prezado(a)', sem despedida e sem assinatura: o sistema registra",
    "   quem escreveu e quando, e isso sai no relatório também.",
    "9. O TAMANHO SEGUE O CONTEÚDO, não há limite de linhas. Atendimento com",
    "   um passo rende um parágrafo; atendimento com cinco passos rende um",
    "   texto detalhado. Descreva cada ação em frase completa, dizendo o que",
    "   foi feito e, quando ajudar a entender, para que serviu. Não corte",
    "   informação para encurtar nem repita ideia para alongar.",
    "10. Escreva em português do Brasil, com todas as frases terminadas em",
    "    ponto.",
    "11. Responda SOMENTE com o texto final, sem comentários nem aspas.",
    "",
    `Chamado: ${contexto.titulo}`,
    `Problema relatado pelo usuário: ${contexto.problema.slice(0, 1500)}`,
    "",
    "Rascunho do técnico:",
    rascunho.slice(0, 3000),
  ].join("\n");

  // Teto generoso, e ainda assim conferido: quanto o modelo "pensa" antes de
  // escrever varia a cada chamada, então um número fixo às vezes basta e às
  // vezes não. Se voltar cortado, refazemos uma vez com o triplo — só se paga
  // o que for realmente gerado, e texto pela metade no registro do chamado é
  // pior que esperar mais dois segundos.
  const primeira = await perguntaIA(prompt, 4000);
  if (!primeira.ok || !primeira.truncado) return primeira;

  const segunda = await perguntaIA(prompt, 12000);
  if (segunda.ok && !segunda.truncado) return segunda;
  // ainda cortado: devolve o mais completo, mas com a bandeira ligada para a
  // tela avisar em vez de fingir que está pronto
  const melhor =
    (segunda.texto?.length ?? 0) > (primeira.texto?.length ?? 0) ? segunda : primeira;
  return { ...melhor, truncado: true };
}

/** Traduz a falha para algo que o técnico entenda na tela. */
function mensagemDeErro(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Chave inválida ou sem permissão (401).";
  if (err instanceof Anthropic.PermissionDeniedError) return "A chave não tem acesso a este modelo (403).";
  if (err instanceof Anthropic.NotFoundError) return "Modelo não encontrado — confira o nome (404).";
  if (err instanceof Anthropic.RateLimitError) return "Limite de uso atingido no momento (429). Tente de novo em instantes.";
  if (err instanceof Anthropic.APIConnectionError) return "Não foi possível conectar ao serviço de IA (rede ou endereço).";
  if (err instanceof Anthropic.APIError) return `O serviço respondeu com erro ${err.status ?? ""}: ${err.message}`.trim();
  if (err instanceof Error && err.name === "AbortError") return "O serviço demorou demais para responder.";
  if (err instanceof Error) return err.message.slice(0, 200);
  return "Falha desconhecida ao falar com o serviço de IA.";
}
