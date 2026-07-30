import { NextResponse } from "next/server";
import { lerConfig } from "@/lib/config-portal";
import { ehAtribuidoA, epochDe } from "@/lib/filas";
import { GlpiAuthError, isOpenStatus, listMyTickets } from "@/lib/glpi";
import { getSession } from "@/lib/session";

/**
 * Alimenta o sino de notificações (roadmap Fase B). Devolve os chamados que
 * exigem atenção com o momento da última mudança, e o relógio do SERVIDOR —
 * o cliente compara os dois valores, evitando divergência de fuso horário.
 *
 * Sem websocket: o sino consulta a cada 60 s e só com a aba visível.
 * Desligável na tela ⚙️ (padrão inicial: PORTAL_NOTIFICACOES no .env).
 */

export const dynamic = "force-dynamic";

/** Teto de chamados lidos por consulta — protege o CT de 1 vCPU. */
const LIMITE_CENTRAL = 100;
const LIMITE_USUARIO = 30;
/** Itens devolvidos ao sino. */
const MAX_ITENS = 15;

export async function GET() {
  const config = await lerConfig();
  if (!config.avisos) {
    return NextResponse.json({ itens: [], agora: Date.now(), desligado: true });
  }

  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const central = session.user?.profileInterface === "central";
  try {
    const tickets = await listMyTickets(
      session.accessToken,
      central ? LIMITE_CENTRAL : LIMITE_USUARIO,
    );

    const itens = tickets
      .filter((t) => {
        // interessa o que está em aberto ou aguardando confirmação do usuário
        if (!isOpenStatus(t.status) && t.status !== 5) return false;
        if (!central) return true; // self-service já só enxerga os próprios
        // técnico: o que é dele + chamado novo sem dono (ninguém pode perder)
        return (
          ehAtribuidoA(t, session.user?.id, session.user?.friendlyName) ||
          (t.status === 1 && t.assignees.length === 0)
        );
      })
      .map((t) => ({
        id: t.id,
        nome: t.name,
        status: t.status,
        em: epochDe(t.date_mod) || epochDe(t.date),
      }))
      .sort((a, b) => b.em - a.em)
      .slice(0, MAX_ITENS);

    return NextResponse.json({ itens, agora: Date.now() });
  } catch (err) {
    if (err instanceof GlpiAuthError) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }
    // falha de rede não pode quebrar o cabeçalho — o sino simplesmente não atualiza
    console.error("Falha ao montar notificações:", err instanceof Error ? err.message : err);
    return NextResponse.json({ itens: [], agora: Date.now() });
  }
}
