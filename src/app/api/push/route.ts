import { NextRequest, NextResponse } from "next/server";
import { lerConfig } from "@/lib/config-portal";
import { chavePublica, desinscrever, inscrever } from "@/lib/push";
import { getSession } from "@/lib/session";

/**
 * Inscrição do navegador para receber avisos no celular (roadmap Fase C).
 * GET  → chave pública do servidor (o navegador precisa dela para se inscrever)
 * POST → guarda a inscrição deste aparelho para o usuário logado
 * DELETE → remove a inscrição deste aparelho
 */

export async function GET() {
  const config = await lerConfig();
  if (!config.pushLigado) return NextResponse.json({ ligado: false });
  return NextResponse.json({ ligado: true, chave: await chavePublica() });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const userId = session.user?.id;
  if (!session.accessToken || !userId) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const config = await lerConfig();
  if (!config.pushLigado) {
    return NextResponse.json({ error: "Avisos desligados." }, { status: 409 });
  }

  try {
    const corpo = (await request.json()) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    const { endpoint } = corpo;
    const p256dh = corpo.keys?.p256dh;
    const auth = corpo.keys?.auth;
    if (!endpoint || !p256dh || !auth || !/^https:\/\//.test(endpoint)) {
      return NextResponse.json({ error: "Inscrição inválida." }, { status: 400 });
    }
    await inscrever({ userId, endpoint, p256dh, auth });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  try {
    const { endpoint } = (await request.json()) as { endpoint?: string };
    if (endpoint) await desinscrever(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
}
