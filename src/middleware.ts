import { getIronSession } from "iron-session";
import { NextRequest, NextResponse } from "next/server";
import { sessionOptions, type SessionData } from "@/lib/session-config";

/**
 * Renova o access token do GLPI antes de expirar (o token dura ~1h; a sessão
 * do portal, 8h). Roda em toda navegação autenticada — sem isso o usuário
 * cairia numa tela de erro a cada hora.
 */

// renova quando faltar menos que isso para expirar
const RENEW_WINDOW_MS = 5 * 60 * 1000;

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions());

  const { accessToken, refreshToken, tokenExpiresAt } = session;
  if (!accessToken || !refreshToken || !tokenExpiresAt) return response;
  if (Date.now() < tokenExpiresAt - RENEW_WINDOW_MS) return response;

  try {
    const res = await fetch(`${(process.env.GLPI_URL ?? "").replace(/\/+$/, "")}/api.php/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: process.env.GLPI_OAUTH_CLIENT_ID,
        client_secret: process.env.GLPI_OAUTH_CLIENT_SECRET,
        refresh_token: refreshToken,
        scope: "api",
      }),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };
      session.accessToken = data.access_token;
      session.refreshToken = data.refresh_token ?? refreshToken;
      session.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      await session.save();
    }
    // falha na renovação não destrói a sessão: as camadas seguintes
    // redirecionam para o login se o token estiver realmente morto
  } catch {
    /* rede indisponível — segue com o token atual */
  }
  return response;
}

export const config = {
  // páginas e APIs autenticadas (exclui login, logout, estáticos)
  matcher: [
    "/",
    "/chamados/:path*",
    "/api/chamados/:path*",
    "/painel",
    "/painel/triagem",
    "/configuracoes",
    "/api/configuracoes/:path*",
    "/perfil",
    "/api/perfil/:path*",
    "/relatorios",
    "/api/relatorios/:path*",
    "/api/documentos/:path*",
    "/api/notificacoes",
    "/api/push",
  ],
};
