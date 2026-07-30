import { NextRequest, NextResponse } from "next/server";
import { GlpiAuthError, getCurrentUser, passwordLogin } from "@/lib/glpi";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  // rate limiting: 5 tentativas/minuto por IP (spec §5.1)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "desconhecido";
  const limit = rateLimit(`login:${ip}`, { max: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um minuto e tente novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let username = "";
  let password = "";
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    username = (body.username ?? "").trim();
    password = body.password ?? "";
  } catch {
    /* corpo inválido tratado abaixo */
  }

  if (!username || !password) {
    return NextResponse.json({ error: "Informe usuário e senha." }, { status: 400 });
  }

  try {
    const tokens = await passwordLogin(username, password);
    const me = await getCurrentUser(tokens.accessToken);

    // O GLPI EMITE TOKEN PARA USUÁRIO DESATIVADO E PARA USUÁRIO NA LIXEIRA —
    // conferido na instância em 27/07/2026. A sessão resultante vem sem
    // user_id, sem perfil e sem entidade, então a pessoa não enxerga dado
    // nenhum, mas entrava no portal e via a tela como se estivesse logada.
    // Servidor desligado tem de receber "usuário ou senha incorretos".
    //
    // `me === null` é outra coisa: falha de rede ao ler /session. Aí o portal
    // continua tolerante, como antes — indisponibilidade do GLPI não pode
    // virar bloqueio de quem tem conta boa.
    if (me !== null && me.id === undefined) {
      console.warn(`Login recusado: conta sem perfil ativo no GLPI (${username})`);
      return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
    }

    const session = await getSession();
    session.accessToken = tokens.accessToken;
    session.refreshToken = tokens.refreshToken;
    session.tokenExpiresAt = tokens.expiresAt;
    session.user = {
      id: me?.id,
      login: username,
      friendlyName: me?.friendlyName,
      profileInterface: me?.profileInterface,
      entityId: me?.entityId,
    };
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GlpiAuthError) {
      return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
    }
    // sem dados sensíveis no log (spec §6)
    console.error("Erro no login:", err instanceof Error ? err.message : "erro desconhecido");
    return NextResponse.json(
      { error: "Não foi possível conectar ao sistema de chamados. Tente novamente em instantes." },
      { status: 502 },
    );
  }
}
