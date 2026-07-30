import { NextRequest, NextResponse } from "next/server";
import { registrarAvaliacaoLocal } from "@/lib/avaliacoes";
import { ehRequerente } from "@/lib/filas";
import { getServiceToken, getTicket, getTicketTimeline, registrarAvaliacao } from "@/lib/glpi";
import { getSession } from "@/lib/session";

const MARCADOR = "[avaliacao-portal]";

/**
 * CSAT de 1 clique (roadmap Fase A): grava a nota como acompanhamento privado
 * via conta de serviço. Blindagens (revisão adversarial 22/07/2026):
 * só o requerente avalia, só chamado solucionado/encerrado, e no máximo uma
 * avaliação por chamado (idempotente).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: "Chamado inválido." }, { status: 400 });
  }

  let nota = 0;
  try {
    const body = (await request.json()) as { nota?: number };
    nota = Number(body.nota);
  } catch {
    /* corpo inválido tratado abaixo */
  }
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return NextResponse.json({ error: "Nota inválida." }, { status: 400 });
  }

  // autorização: precisa enxergar o chamado…
  const ticket = await getTicket(session.accessToken, ticketId).catch(() => null);
  if (!ticket) {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  }
  // …estar solucionado/encerrado…
  if (ticket.status !== 5 && ticket.status !== 6) {
    return NextResponse.json(
      { error: "O chamado ainda não foi solucionado." },
      { status: 409 },
    );
  }
  // …e ser O REQUERENTE (a nota é dele por definição)
  if (!ehRequerente(ticket, session.user?.id, session.user?.profileInterface === "central")) {
    return NextResponse.json(
      { error: "Só quem abriu o chamado pode avaliar o atendimento." },
      { status: 403 },
    );
  }

  // idempotência: uma avaliação por chamado — repetição responde ok sem gravar
  const serviceToken = await getServiceToken();
  if (serviceToken) {
    const timeline = await getTicketTimeline(serviceToken, ticketId).catch(() => null);
    if (timeline?.some((item) => item.content.includes(MARCADOR))) {
      return NextResponse.json({ ok: true, repetida: true });
    }
  }

  const ok = await registrarAvaliacao(ticketId, nota);
  if (!ok) {
    console.error(`Avaliação do chamado #${ticketId} não pôde ser registrada (nota ${nota})`);
  }
  // índice local para os relatórios (o registro oficial é o do GLPI acima)
  await registrarAvaliacaoLocal(ticketId, nota).catch(() => undefined);
  return NextResponse.json({ ok });
}
