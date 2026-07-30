import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, GlpiAuthError } from "@/lib/glpi";
import { aplicaFiltros, buscarTodosChamados, filtraPorPeriodo, resolvePeriodo } from "@/lib/relatorios";
import { getSession } from "@/lib/session";
import { TICKET_STATUS } from "@/lib/glpi";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  try {
    const me = await getCurrentUser(session.accessToken);
    if (me?.profileInterface !== "central") {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const p = resolvePeriodo(
      sp.get("periodo") ?? undefined,
      sp.get("de") ?? undefined,
      sp.get("ate") ?? undefined,
      new Date(),
    );
    const tickets = aplicaFiltros(filtraPorPeriodo(await buscarTodosChamados(), p), {
      categoria: sp.get("categoria") ?? undefined,
      setor: sp.get("setor") ?? undefined,
      usuario: sp.get("usuario") ?? undefined,
    });

    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const linhas = [
      "id;data_abertura;titulo;categoria;secretaria;requerente;status;data_solucao",
      ...tickets.map((t) =>
        [
          t.id,
          t.data ?? "",
          esc(t.titulo),
          esc(t.categoria),
          esc(t.entidade),
          esc(t.requerente),
          esc(TICKET_STATUS[t.status]?.label ?? String(t.status)),
          t.dataSolucao ?? "",
        ].join(";"),
      ),
    ];
    // BOM para o Excel abrir acentos corretamente
    const csv = "﻿" + linhas.join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="chamados-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof GlpiAuthError) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }
    console.error("Erro no CSV:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ error: "Falha ao gerar o CSV." }, { status: 502 });
  }
}
