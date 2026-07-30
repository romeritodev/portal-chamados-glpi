import { NextRequest, NextResponse } from "next/server";
import { ehRequerente } from "@/lib/filas";
import {
  addFollowup,
  approveSolutionAsService,
  closeTicket,
  getPendingSolution,
  getTicket,
  GlpiAuthError,
  GlpiError,
  refreshAccessToken,
  setSolutionApproval,
  updateTicketStatus,
} from "@/lib/glpi";
import { textToSafeHtml } from "@/lib/sanitize";
import { getSession, type Session } from "@/lib/session";

async function tryRefresh(session: Session): Promise<boolean> {
  if (!session.refreshToken) return false;
  try {
    const tokens = await refreshAccessToken(session.refreshToken);
    session.accessToken = tokens.accessToken;
    session.refreshToken = tokens.refreshToken;
    session.tokenExpiresAt = tokens.expiresAt;
    await session.save();
    return true;
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const { id: idParam } = await context.params;
  const ticketId = Number(idParam);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: "Chamado inválido." }, { status: 400 });
  }

  let acao = "";
  let comentario = "";
  try {
    const body = (await request.json()) as { acao?: string; comentario?: string };
    acao = body.acao ?? "";
    comentario = (body.comentario ?? "").trim();
  } catch {
    /* tratado abaixo */
  }
  if (acao !== "aprovar" && acao !== "recusar") {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  // aceitar ou recusar é do requerente, e de mais ninguém: o técnico que
  // resolveu não pode dar o próprio trabalho por aprovado
  const ticket = await getTicket(session.accessToken, ticketId).catch(() => null);
  if (!ticket) {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  }
  if (!ehRequerente(ticket, session.user?.id, session.user?.profileInterface === "central")) {
    return NextResponse.json(
      { error: "Só quem abriu o chamado pode aceitar ou recusar a solução." },
      { status: 403 },
    );
  }

  const executar = async () => {
    // a solução pendente é localizada no servidor — não confiar em id do browser
    const pendente = await getPendingSolution(session.accessToken!, ticketId);
    if (!pendente) {
      throw new GlpiError("Não há solução aguardando aprovação neste chamado", 404);
    }
    if (acao === "recusar") {
      // comportamento nativo do GLPI: um acompanhamento do requerente num
      // chamado solucionado recusa a solução e reabre o chamado — sem PATCH
      const texto = comentario || "A solução informada não resolveu o problema.";
      await addFollowup(session.accessToken!, ticketId, textToSafeHtml(texto.slice(0, 5000)));
      return { ok: true as const };
    }
    // APROVAR SÃO DOIS PASSOS. Marcar a solução como aceita NÃO encerra o
    // chamado — o GLPI não faz isso sozinho pela API (comprovado na
    // instância: solução aceita e chamado parado em "solucionado"). Faltando
    // o segundo passo, o usuário aprova e continua vendo "aguardando você".

    // 1) marcar a solução como aceita, com o token do próprio usuário
    let aceitou = false;
    try {
      await setSolutionApproval(session.accessToken!, ticketId, pendente.id, true);
      aceitou = true;
    } catch (err) {
      if (!(err instanceof GlpiError) || err.status !== 403) throw err;
    }

    // 2) encerrar. updateTicketStatus já tenta com o token do usuário e cai
    //    para a conta de serviço quando ele não tem o direito.
    if (aceitou) {
      if (await updateTicketStatus(session.accessToken!, ticketId, 6)) {
        return { ok: true as const };
      }
      return {
        ok: true as const,
        aviso:
          "Obrigado pela confirmação! O chamado será fechado automaticamente pelo sistema nos próximos dias.",
      };
    }

    // não conseguiu marcar com o token do usuário: a conta de serviço faz os
    // dois passos e ainda registra o usuário como aprovador — o self-service
    // tem esse direito na interface web, mas a API v2 não o expõe. O usuário
    // só enxerga os próprios chamados, e getPendingSolution acima já garantiu
    // que ele tem acesso a este.
    if (await approveSolutionAsService(ticketId, pendente.id, session.user?.id)) {
      return { ok: true as const };
    }
    // 3) fechamento direto com o token do usuário
    try {
      await closeTicket(session.accessToken!, ticketId);
      return { ok: true as const };
    } catch (err) {
      if (err instanceof GlpiError && err.status === 403) {
        // 4) sem direito nenhum: informa o fechamento automático nativo do GLPI
        return {
          ok: true as const,
          aviso:
            "Obrigado pela confirmação! O chamado será fechado automaticamente pelo sistema nos próximos dias.",
        };
      }
      throw err;
    }
  };

  try {
    let resultado;
    try {
      resultado = await executar();
    } catch (err) {
      if (err instanceof GlpiAuthError && (await tryRefresh(session))) {
        resultado = await executar();
      } else {
        throw err;
      }
    }
    return NextResponse.json(resultado);
  } catch (err) {
    if (err instanceof GlpiAuthError) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }
    if (err instanceof Error && err.message.includes("aguardando aprovação")) {
      return NextResponse.json(
        { error: "Este chamado não tem solução aguardando aprovação." },
        { status: 409 },
      );
    }
    console.error("Erro na aprovação de solução:", err instanceof Error ? err.message : "erro");
    return NextResponse.json(
      { error: "Não foi possível registrar sua resposta. Tente novamente em instantes." },
      { status: 502 },
    );
  }
}
