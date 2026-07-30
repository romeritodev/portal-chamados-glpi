import { getIronSession } from "iron-session";
import { NextRequest, NextResponse } from "next/server";
import { sessionOptions, type SessionData } from "@/lib/session-config";

export async function POST(request: NextRequest) {
  // monta o destino a partir do host real (o build standalone reporta 0.0.0.0
  // em request.url; atrás do Cloudflare, usa o host/proto encaminhados)
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const destino = host ? `${proto}://${host}/login` : new URL("/login", request.url).toString();

  // vincular a sessão à própria resposta do redirect garante que o cookie de
  // logout (destroy) seja gravado nela — senão o /login "devolve" para a home
  const response = NextResponse.redirect(destino, 303);
  const session = await getIronSession<SessionData>(request, response, sessionOptions());
  session.destroy();
  return response;
}
