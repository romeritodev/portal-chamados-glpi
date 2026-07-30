import { NextRequest, NextResponse } from "next/server";
import { lerAvatar } from "@/lib/avatares";
import { getSession } from "@/lib/session";

/**
 * Serve a foto de perfil de um usuário. Exige apenas estar autenticado: as
 * fotos aparecem na conversa dos chamados, então quem participa precisa ver a
 * dos outros. Nada além da imagem é exposto.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.accessToken) {
    return new NextResponse(null, { status: 401 });
  }

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return new NextResponse(null, { status: 400 });
  }

  const dados = await lerAvatar(userId);
  if (!dados) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(dados), {
    headers: {
      "Content-Type": "image/jpeg",
      // privado: cada usuário guarda no próprio navegador, nunca em cache comum
      "Cache-Control": "private, max-age=300",
    },
  });
}
