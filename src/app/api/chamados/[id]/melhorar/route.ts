import { NextRequest, NextResponse } from "next/server";
import { lerConfig } from "@/lib/config-portal";
import { getTicket, GlpiAuthError } from "@/lib/glpi";
import { melhorarTexto } from "@/lib/ia";
import { rateLimit } from "@/lib/rate-limit";
import { htmlToPlainText } from "@/lib/sanitize";
import { getSession } from "@/lib/session";

/**
 * Melhora o texto que o técnico escreveu (botão ✨ na caixa de resposta).
 *
 * O texto melhorado volta para a CAIXA, nunca direto para o chamado: quem
 * assina o que vai ao usuário continua sendo o técnico, que lê, ajusta ou
 * descarta. O portal também guarda o rascunho original para dar um clique de
 * volta — sem isso a "melhoria" seria irreversível.
 *
 * Cada clique custa dinheiro na conta da IA, então limitamos por usuário.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  if (session.user?.profileInterface !== "central") {
    return NextResponse.json({ error: "Ação restrita à equipe de TI." }, { status: 403 });
  }

  const limite = rateLimit(`melhorar:${session.user?.id ?? "anon"}`, {
    max: 20,
    windowMs: 60_000,
  });
  if (!limite.allowed) {
    return NextResponse.json(
      { error: "Muitos pedidos seguidos. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeconds) } },
    );
  }

  // mesma condição que faz o botão aparecer na tela. Se divergir, o técnico
  // vê um botão que só sabe dar erro — e um 502 ainda chega ao navegador como
  // página do Cloudflare, sem a explicação que escrevemos aqui.
  const config = await lerConfig();
  if (config.iaProvedor === "desligado" || !config.iaChave || !config.iaSugestao) {
    return NextResponse.json(
      { error: "O apoio da IA está desligado ou sem chave nas configurações ⚙️." },
      { status: 409 },
    );
  }

  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: "Chamado inválido." }, { status: 400 });
  }

  let corpo: { texto?: string; modo?: string };
  try {
    corpo = (await request.json()) as { texto?: string; modo?: string };
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const rascunho = (corpo.texto ?? "").trim();
  if (rascunho.length < 10) {
    return NextResponse.json(
      { error: "Escreva um pouco mais antes de pedir ajuda para melhorar." },
      { status: 400 },
    );
  }
  const modo = corpo.modo === "solucao" ? "solucao" : "resposta";

  try {
    // o texto do chamado entra como contexto: sem ele o modelo não sabe do
    // que a resposta trata e tende a generalizar
    const ticket = await getTicket(session.accessToken, ticketId);
    if (!ticket) {
      return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
    }

    const resposta = await melhorarTexto(
      rascunho,
      {
        titulo: ticket.name,
        problema: htmlToPlainText(ticket.content ?? "").slice(0, 1500),
      },
      modo,
    );
    if (!resposta.ok || !resposta.texto) {
      return NextResponse.json(
        { error: resposta.erro ?? "A IA não respondeu." },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      texto: resposta.texto,
      truncado: resposta.truncado === true,
    });
  } catch (err) {
    if (err instanceof GlpiAuthError) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }
    console.error(
      `Falha ao melhorar texto (#${ticketId}):`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "Falha ao falar com o serviço de IA." }, { status: 502 });
  }
}
