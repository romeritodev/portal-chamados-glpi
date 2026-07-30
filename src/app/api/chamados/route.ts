import { NextRequest, NextResponse } from "next/server";
import { atalhoPorSlug, categoriaPorSlug } from "@/config/categorias";
import {
  addTicketDocument,
  addTicketRequester,
  createTicket,
  getCurrentUser,
  getTicket,
  GlpiAuthError,
  refreshAccessToken,
  URGENCIAS,
} from "@/lib/glpi";
import { legacyUploadDocumentToTicket } from "@/lib/glpi-legacy";
import { textToSafeHtml } from "@/lib/sanitize";
import { getSession, type Session } from "@/lib/session";

const TITULO_MAX = 120;
const DESCRICAO_MAX = 5000;

// anexos (spec §5.2): imagem ou PDF, até 10 MB cada, no máximo 5
const ANEXO_MAX_BYTES = 10 * 1024 * 1024;
const ANEXO_MAX_QTD = 5;
const ANEXO_TIPOS = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/** Tenta renovar o access token via refresh token e persiste na sessão. */
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

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const titulo = String(form.get("titulo") ?? "").trim();
  const descricao = String(form.get("descricao") ?? "").trim();
  const urgencia = URGENCIAS.find((u) => u.value === form.get("urgencia"));
  // o mapeamento slug → categoria é resolvido no servidor (não confiar em id vindo do browser)
  const categoria = categoriaPorSlug(String(form.get("categoria") ?? ""));
  // o atalho escolhido no passo 2 vira a subcategoria; slug desconhecido é
  // simplesmente ignorado e o chamado fica na categoria-mãe
  const atalho = atalhoPorSlug(categoria, String(form.get("subcategoria") ?? ""));

  if (!titulo || !descricao) {
    return NextResponse.json({ error: "Preencha o título e a descrição do problema." }, { status: 400 });
  }
  if (titulo.length > TITULO_MAX || descricao.length > DESCRICAO_MAX) {
    return NextResponse.json({ error: "Título ou descrição longos demais." }, { status: 400 });
  }
  if (!urgencia) {
    return NextResponse.json({ error: "Escolha a urgência do chamado." }, { status: 400 });
  }
  if (!categoria) {
    return NextResponse.json({ error: "Escolha o tipo de problema." }, { status: 400 });
  }

  // anexos opcionais — validação de tipo, tamanho e quantidade no servidor (spec §6)
  const anexos = form
    .getAll("anexos")
    .filter((a): a is File => a instanceof File && a.size > 0);
  if (anexos.length > ANEXO_MAX_QTD) {
    return NextResponse.json(
      { error: `Envie no máximo ${ANEXO_MAX_QTD} anexos por chamado.` },
      { status: 400 },
    );
  }
  for (const arquivo of anexos) {
    if (arquivo.size > ANEXO_MAX_BYTES) {
      return NextResponse.json(
        { error: `O arquivo "${arquivo.name}" é grande demais (limite de 10 MB por arquivo).` },
        { status: 400 },
      );
    }
    if (!ANEXO_TIPOS.has(arquivo.type)) {
      return NextResponse.json(
        { error: `Tipo do arquivo "${arquivo.name}" não permitido. Envie fotos (JPG/PNG) ou PDF.` },
        { status: 400 },
      );
    }
  }

  const input = {
    name: titulo,
    content: textToSafeHtml(descricao),
    urgency: urgencia.glpi,
    categoryId: atalho?.categoriaId ?? categoria.categoriaId,
    // incidente ou requisição sai do que a pessoa já escolheu — nunca de uma
    // pergunta em jargão ITIL. O atalho manda; sem ele, vale o card.
    type: atalho?.tipo ?? categoria.tipo,
  };

  try {
    let id: number;
    try {
      id = await createTicket(session.accessToken, input);
    } catch (err) {
      // token expirado no meio da sessão → tenta refresh uma vez (spec §4.1)
      if (err instanceof GlpiAuthError && (await tryRefresh(session))) {
        id = await createTicket(session.accessToken!, input);
      } else {
        throw err;
      }
    }
    // vincula o requerente ao chamado (não-fatal: o chamado já foi criado)
    let userId = session.user?.id;
    if (!userId) {
      // sessões criadas antes de o id ser salvo no login não o possuem —
      // busca agora e persiste para os próximos chamados
      const me = await getCurrentUser(session.accessToken!);
      userId = me?.id;
      if (userId && session.user) {
        session.user.id = userId;
        await session.save();
      }
    }
    if (userId) {
      await addTicketRequester(session.accessToken!, id, userId);
    } else {
      console.error(`Chamado ${id}: id do usuário indisponível, requerente não registrado`);
    }

    // anexos: não-fatais — o chamado já existe; em caso de falha o usuário é avisado
    let avisoAnexo: string | undefined;
    const falhas: string[] = [];
    if (anexos.length > 0) {
      // a entidade do chamado é necessária: o documento deve nascer nela
      let entityId: number | undefined;
      try {
        entityId = (await getTicket(session.accessToken!, id))?.entityId;
      } catch {
        /* tratado abaixo pelo fallback */
      }
      for (const arquivo of anexos) {
        // caminho principal: API legada com a conta de serviço (a v2 desta
        // versão não cria o vínculo documento→chamado — spec §4.3)
        if (entityId !== undefined && (await legacyUploadDocumentToTicket(id, entityId, arquivo))) {
          continue;
        }
        // plano B: tentativa direta na v2 com o token do usuário
        try {
          await addTicketDocument(session.accessToken!, id, arquivo);
        } catch (err) {
          console.error(
            `Chamado ${id}: falha ao anexar "${arquivo.name}":`,
            err instanceof Error ? err.message : "erro desconhecido",
          );
          falhas.push(arquivo.name);
        }
      }
    }
    if (falhas.length > 0) {
      avisoAnexo =
        falhas.length === anexos.length
          ? "O chamado foi registrado, mas não foi possível enviar os anexos. Se forem importantes, responda o chamado informando isso."
          : `O chamado foi registrado, mas alguns anexos falharam: ${falhas.join(", ")}.`;
    }
    return NextResponse.json({ ok: true, id, avisoAnexo });
  } catch (err) {
    if (err instanceof GlpiAuthError) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }
    console.error("Erro ao criar chamado:", err instanceof Error ? err.message : "erro desconhecido");
    return NextResponse.json(
      { error: "Não foi possível registrar o chamado. Tente novamente em instantes." },
      { status: 502 },
    );
  }
}
