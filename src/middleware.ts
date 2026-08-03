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
      return response;
    }

    /**
     * O GLPI RECUSOU A RENOVAÇÃO — o refresh token venceu ou foi revogado.
     * Não há volta: encerra a sessão do portal aqui e manda para o login.
     *
     * Antes a sessão era mantida "para as camadas seguintes decidirem", e o
     * resultado era pior que um erro: o cookie continuava válido, então o
     * /login devolvia a pessoa para dentro do portal, que tentava falar com
     * o GLPI, falhava e mandava para o /login de novo — a tela só piscava.
     * E as telas que checam o perfil ao vivo respondiam 404, como se a
     * pessoa não tivesse permissão.
     *
     * 400 e 401 são resposta do servidor, não falha de rede: aí a decisão é
     * definitiva. Erro 5xx ou queda de rede caem no catch e preservam a
     * sessão, porque nesse caso o token pode estar bom.
     */
    if (res.status === 400 || res.status === 401) {
      session.destroy();
      const login = new URL("/login", request.url);
      login.searchParams.set("expirou", "1");
      const saida = NextResponse.redirect(login);
      /**
       * O cookie é apagado EXPLICITAMENTE nesta resposta.
       *
       * Copiar os cookies da resposta original não bastou — e o preço foi
       * alto: o cookie sobrevivia, o /login via sessão ativa e devolvia para
       * "/", que caía aqui de novo. Laço infinito, tela nenhuma carregava.
       * Escrever o vencimento na própria resposta que redireciona não depende
       * de a biblioteca ter marcado a resposta certa.
       */
      const opcoes = sessionOptions();
      saida.cookies.set(opcoes.cookieName, "", {
        ...opcoes.cookieOptions,
        maxAge: 0,
        expires: new Date(0),
      });
      return saida;
    }
  } catch {
    /* rede indisponível — segue com o token atual, que pode estar bom */
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
    // o mural fica ligado o dia inteiro: passar pelo middleware é o que
    // renova o token do GLPI e mantém a sessão viva sem ninguém tocar na tela
    "/mural",
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
