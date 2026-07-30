import { NextRequest, NextResponse } from "next/server";
import { addFollowup, GlpiAuthError, refreshAccessToken } from "@/lib/glpi";
import { textToSafeHtml } from "@/lib/sanitize";
import { getSession, type Session } from "@/lib/session";

const COMENTARIO_MAX = 5000;

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

  let texto = "";
  try {
    const body = (await request.json()) as { texto?: string };
    texto = (body.texto ?? "").trim();
  } catch {
    /* tratado abaixo */
  }
  if (!texto) {
    return NextResponse.json({ error: "Escreva o comentário antes de enviar." }, { status: 400 });
  }
  if (texto.length > COMENTARIO_MAX) {
    return NextResponse.json({ error: "Comentário longo demais." }, { status: 400 });
  }

  const contentHtml = textToSafeHtml(texto);

  try {
    try {
      await addFollowup(session.accessToken, ticketId, contentHtml);
    } catch (err) {
      if (err instanceof GlpiAuthError && (await tryRefresh(session))) {
        await addFollowup(session.accessToken!, ticketId, contentHtml);
      } else {
        throw err;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GlpiAuthError) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }
    console.error("Erro ao comentar:", err instanceof Error ? err.message : "erro desconhecido");
    return NextResponse.json(
      { error: "Não foi possível enviar o comentário. Tente novamente em instantes." },
      { status: 502 },
    );
  }
}
