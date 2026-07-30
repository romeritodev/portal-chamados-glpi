import { NextRequest, NextResponse } from "next/server";
import { lerConfig, type ProvedorIA } from "@/lib/config-portal";
import { getCurrentUser } from "@/lib/glpi";
import { perguntaComConfig } from "@/lib/ia";
import { getSession } from "@/lib/session";

/**
 * "Testar conexão" da tela ⚙️: faz uma chamada real ao serviço de IA com os
 * valores que estão no formulário (a chave em branco usa a já gravada), sem
 * precisar salvar antes. Custa uma fração de centavo.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const me = await getCurrentUser(session.accessToken).catch(() => null);
  if (me?.profileInterface !== "central") {
    return NextResponse.json({ error: "Acesso restrito à equipe de TI." }, { status: 403 });
  }

  let corpo: Record<string, unknown> = {};
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    /* sem corpo: testa exatamente o que está gravado */
  }

  const atual = await lerConfig();
  const chaveDigitada = typeof corpo.iaChave === "string" ? corpo.iaChave.trim() : "";
  const config = {
    ...atual,
    iaProvedor: (corpo.iaProvedor as ProvedorIA) ?? atual.iaProvedor,
    iaModelo: (typeof corpo.iaModelo === "string" && corpo.iaModelo.trim()) || atual.iaModelo,
    iaBaseUrl: typeof corpo.iaBaseUrl === "string" ? corpo.iaBaseUrl.trim() : atual.iaBaseUrl,
    iaChave: chaveDigitada || atual.iaChave,
  };

  const inicio = Date.now();
  const r = await perguntaComConfig(
    config,
    "Responda apenas com a palavra OK, sem mais nada.",
    64,
  );
  const ms = Date.now() - inicio;

  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 200 });
  return NextResponse.json({
    ok: true,
    resposta: (r.texto ?? "").slice(0, 80),
    tempo: `${(ms / 1000).toFixed(1)}s`,
    modelo: config.iaModelo,
  });
}
