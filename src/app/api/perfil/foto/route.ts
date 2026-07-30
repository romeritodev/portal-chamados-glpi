import { NextRequest, NextResponse } from "next/server";
import { AVATAR_MAX_BYTES, AVATAR_TIPOS, gravarAvatar, removerAvatar } from "@/lib/avatares";
import { getSession } from "@/lib/session";

/**
 * Foto de perfil do PRÓPRIO usuário logado. Ninguém troca a foto de outra
 * pessoa: o id vem da sessão, nunca do corpo da requisição.
 */

export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session.user?.id;
  if (!session.accessToken || !userId) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  let arquivo: File | null = null;
  try {
    const form = await request.formData();
    const enviado = form.get("foto");
    if (enviado instanceof File) arquivo = enviado;
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }

  if (!arquivo) {
    return NextResponse.json({ error: "Nenhuma imagem enviada." }, { status: 400 });
  }
  if (!AVATAR_TIPOS.includes(arquivo.type)) {
    return NextResponse.json({ error: "Envie uma imagem JPG, PNG ou WebP." }, { status: 400 });
  }
  if (arquivo.size > AVATAR_MAX_BYTES) {
    return NextResponse.json({ error: "Imagem grande demais." }, { status: 400 });
  }

  const dados = Buffer.from(await arquivo.arrayBuffer());
  // confere a assinatura do arquivo: o tipo declarado pelo navegador não basta
  const ehJpeg = dados[0] === 0xff && dados[1] === 0xd8;
  const ehPng = dados[0] === 0x89 && dados[1] === 0x50 && dados[2] === 0x4e && dados[3] === 0x47;
  const ehWebp = dados.subarray(8, 12).toString("ascii") === "WEBP";
  if (!ehJpeg && !ehPng && !ehWebp) {
    return NextResponse.json({ error: "O arquivo não é uma imagem válida." }, { status: 400 });
  }

  await gravarAvatar(userId, dados);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  const userId = session.user?.id;
  if (!session.accessToken || !userId) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  await removerAvatar(userId);
  return NextResponse.json({ ok: true });
}
