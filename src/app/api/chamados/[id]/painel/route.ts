import { NextRequest, NextResponse } from "next/server";
import { addSolution, GlpiAuthError, setTicketAssignee, updateTicketStatus } from "@/lib/glpi";
import { textToSafeHtml } from "@/lib/sanitize";
import { getSession } from "@/lib/session";

/**
 * Ações do painel do técnico (roadmap Fase B): mover de coluna e assumir/
 * liberar o chamado. Restrito a perfis de interface central — um usuário
 * self-service não pode mexer no fluxo de atendimento.
 */

const STATUS_PERMITIDOS = new Set([1, 2, 3, 4, 5, 6]);

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

  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: "Chamado inválido." }, { status: 400 });
  }

  let corpo: { acao?: string; status?: number; texto?: string };
  try {
    corpo = (await request.json()) as { acao?: string; status?: number; texto?: string };
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  try {
    // concluir = registrar a solução. Mudar só o status deixaria o usuário
    // sem os botões de aceitar/recusar, porque não haveria o que aprovar.
    if (corpo.acao === "resolver") {
      const texto = (corpo.texto ?? "").trim();
      if (texto.length < 3) {
        return NextResponse.json(
          { error: "Descreva o que foi feito para resolver." },
          { status: 400 },
        );
      }
      const ok = await addSolution(
        session.accessToken,
        ticketId,
        textToSafeHtml(texto.slice(0, 5000)),
      );
      return ok
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: "O GLPI não aceitou registrar a solução." }, { status: 502 });
    }

    if (corpo.acao === "status") {
      const status = Number(corpo.status);
      if (!STATUS_PERMITIDOS.has(status)) {
        return NextResponse.json({ error: "Situação inválida." }, { status: 400 });
      }
      const ok = await updateTicketStatus(session.accessToken, ticketId, status);
      return ok
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: "O GLPI não aceitou mudar a situação." }, { status: 502 });
    }

    if (corpo.acao === "assumir" || corpo.acao === "liberar") {
      const userId = session.user?.id;
      if (!userId) {
        return NextResponse.json({ error: "Usuário não identificado." }, { status: 400 });
      }
      const ok = await setTicketAssignee(
        session.accessToken,
        ticketId,
        userId,
        corpo.acao === "assumir",
      );
      return ok
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: "O GLPI não aceitou a atribuição." }, { status: 502 });
    }

    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (err) {
    if (err instanceof GlpiAuthError) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }
    console.error(`Falha na ação do painel (#${ticketId}):`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Falha ao falar com o GLPI." }, { status: 502 });
  }
}
