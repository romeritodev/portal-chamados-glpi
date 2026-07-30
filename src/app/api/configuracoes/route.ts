import { NextRequest, NextResponse } from "next/server";
import { gravarConfig, lerConfig, configPublica, type ProvedorIA } from "@/lib/config-portal";
import { getCurrentUser } from "@/lib/glpi";
import { getSession } from "@/lib/session";

/**
 * Grava a configuração editada na tela ⚙️. Restrito a perfis de interface
 * central — o perfil é reconferido no GLPI a cada chamada, não no cookie.
 */

const PROVEDORES = new Set<ProvedorIA>(["desligado", "anthropic", "openai"]);

/** Devolve o usuário técnico autenticado, ou uma resposta de erro. */
async function exigeTecnico() {
  const session = await getSession();
  if (!session.accessToken) {
    return { erro: NextResponse.json({ error: "Sessão expirada." }, { status: 401 }) };
  }
  const me = await getCurrentUser(session.accessToken).catch(() => null);
  if (me?.profileInterface !== "central") {
    return { erro: NextResponse.json({ error: "Acesso restrito à equipe de TI." }, { status: 403 }) };
  }
  return { nome: me.friendlyName ?? session.user?.friendlyName ?? "equipe de TI" };
}

export async function POST(request: NextRequest) {
  const guarda = await exigeTecnico();
  if (guarda.erro) return guarda.erro;

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const provedor = String(corpo.iaProvedor ?? "desligado") as ProvedorIA;
  if (!PROVEDORES.has(provedor)) {
    return NextResponse.json({ error: "Provedor inválido." }, { status: 400 });
  }

  const modelo = String(corpo.iaModelo ?? "").trim().slice(0, 120);
  const baseUrl = String(corpo.iaBaseUrl ?? "").trim().slice(0, 300);
  if (provedor === "openai" && baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    return NextResponse.json(
      { error: "O endereço do serviço deve começar com http:// ou https://" },
      { status: 400 },
    );
  }

  const atual = await lerConfig();
  // chave em branco = manter a que já está gravada; só troca se digitarem uma
  const chaveNova = typeof corpo.iaChave === "string" ? corpo.iaChave.trim() : "";
  const iaChave = corpo.removerChave === true ? "" : chaveNova || atual.iaChave;

  const bool = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);

  const salvo = await gravarConfig(
    {
      iaProvedor: provedor,
      iaModelo: modelo || atual.iaModelo,
      iaBaseUrl: baseUrl,
      iaChave,
      iaTriagem: bool(corpo.iaTriagem, atual.iaTriagem),
      iaDuplicado: bool(corpo.iaDuplicado, atual.iaDuplicado),
      iaSugestao: bool(corpo.iaSugestao, atual.iaSugestao),
      avisos: bool(corpo.avisos, atual.avisos),
      painel: bool(corpo.painel, atual.painel),
      pushLigado: bool(corpo.pushLigado, atual.pushLigado),
    },
    guarda.nome,
  );

  // devolve sem o segredo
  return NextResponse.json({ ok: true, config: configPublica(salvo) });
}
