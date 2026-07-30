import { NextRequest, NextResponse } from "next/server";
import { CATEGORIAS, chaveVisibilidade } from "@/config/categorias";
import { gravarConfig } from "@/lib/config-portal";
import { getCurrentUser } from "@/lib/glpi";
import { getSession } from "@/lib/session";

/**
 * Grava quais serviços aparecem para cada setor (tela ⚙️ › Serviços).
 * Mesmo acesso da tela de configurações: perfil de interface central,
 * reconferido no GLPI a cada chamada, não no cookie.
 *
 * A validação aqui é para o arquivo não virar lixo, não para segurança: esta
 * configuração organiza a tela de abertura e não restringe nada na API.
 */

const MAX_SETORES = 200;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const me = await getCurrentUser(session.accessToken).catch(() => null);
  if (me?.profileInterface !== "central") {
    return NextResponse.json({ error: "Acesso restrito à equipe de TI." }, { status: 403 });
  }

  let corpo: { visibilidade?: unknown };
  try {
    corpo = (await request.json()) as { visibilidade?: unknown };
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const bruto = corpo.visibilidade;
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  }

  // só aceitamos chaves de serviços que existem — chave inventada viraria
  // regra órfã que ninguém consegue mais encontrar para apagar
  const conhecidas = new Set<string>();
  for (const c of CATEGORIAS) {
    conhecidas.add(chaveVisibilidade(c.slug));
    for (const a of c.atalhos ?? []) conhecidas.add(chaveVisibilidade(c.slug, a.slug));
  }

  const limpo: Record<string, number[] | "todos"> = {};
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (!conhecidas.has(chave)) continue;
    if (valor === "todos") {
      limpo[chave] = "todos";
      continue;
    }
    if (!Array.isArray(valor)) continue;
    const ids = Array.from(
      new Set(
        valor.filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v > 0),
      ),
    ).slice(0, MAX_SETORES);
    // lista vazia esconderia o serviço de todo mundo sem dizer isso em lugar
    // nenhum; a leitura honesta é "sem restrição"
    limpo[chave] = ids.length === 0 ? "todos" : ids;
  }

  const nome = me.friendlyName ?? session.user?.friendlyName ?? "equipe de TI";
  await gravarConfig({ visibilidade: limpo }, nome);
  return NextResponse.json({ ok: true, visibilidade: limpo });
}
