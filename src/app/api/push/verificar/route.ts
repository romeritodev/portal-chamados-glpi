import { NextRequest, NextResponse } from "next/server";
import { verificarUmaVez } from "@/lib/vigia-chamados";

/**
 * Procura o que mudou nos chamados e dispara os avisos no celular.
 *
 * Acionado de fora por um temporizador do sistema (systemd timer no servidor),
 * não por um laço dentro do Next: assim o ciclo aparece no journalctl, sobrevive
 * a deploys sem estado pendurado e pode ser disparado à mão para teste.
 *
 * Protegido por um token compartilhado (PORTAL_CRON_TOKEN no .env). Sem token
 * configurado, a rota fica desativada — nunca aberta por engano.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const esperado = process.env.PORTAL_CRON_TOKEN;
  if (!esperado) {
    return NextResponse.json({ error: "Rota desativada (sem token)." }, { status: 503 });
  }
  if (request.headers.get("x-portal-token") !== esperado) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const r = await verificarUmaVez();
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    console.error("[vigia] falhou:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Falha ao verificar chamados." }, { status: 500 });
  }
}
