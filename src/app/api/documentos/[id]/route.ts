import { NextRequest, NextResponse } from "next/server";
import { downloadTicketDocument, getTicket, GlpiAuthError } from "@/lib/glpi";
import { getSession } from "@/lib/session";

/**
 * Serve um anexo do GLPI para o navegador (que nunca fala direto com o GLPI).
 * Exige ?chamado=<id> e valida: o usuário enxerga o chamado E o documento
 * pertence a ele.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const { id: idParam } = await context.params;
  const documentId = Number(idParam);
  const ticketId = Number(request.nextUrl.searchParams.get("chamado"));
  if (!Number.isInteger(documentId) || documentId <= 0 || !Number.isInteger(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  try {
    // o usuário precisa enxergar o chamado (perfil self-service = só os dele)
    const ticket = await getTicket(session.accessToken, ticketId);
    if (!ticket) {
      return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
    }

    const upstream = await downloadTicketDocument(session.accessToken, ticketId, documentId);
    if (!upstream) {
      return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
    }

    const headers = new Headers();
    const contentType = upstream.headers.get("Content-Type");
    const disposition = upstream.headers.get("Content-Disposition");
    if (contentType) headers.set("Content-Type", contentType);
    if (disposition) headers.set("Content-Disposition", disposition.replace("attachment", "inline"));
    headers.set("Cache-Control", "private, max-age=300");

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err) {
    if (err instanceof GlpiAuthError) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }
    console.error("Erro ao servir anexo:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ error: "Falha ao carregar o anexo." }, { status: 502 });
  }
}
