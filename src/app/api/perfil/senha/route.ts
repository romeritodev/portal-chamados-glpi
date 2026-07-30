import { NextRequest, NextResponse } from "next/server";
import { GlpiAuthError, getServiceToken, passwordLogin, v2Fetch } from "@/lib/glpi";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

/**
 * Troca da própria senha, a partir da tela Meu perfil.
 *
 * EXIGE A SENHA ATUAL, e a conferência é um login de verdade no GLPI. Sessão
 * aberta não pode valer como prova de identidade para mudar credencial: em
 * balcão de prefeitura é rotina alguém sentar num computador com o portal
 * aberto, e sem esta trava trocaria a senha e tomaria a conta em três cliques.
 *
 * Como a rota confere senha, ela também é superfície de tentativa e erro —
 * daí o limite por usuário.
 *
 * Só mexe no usuário DA SESSÃO: o id vem do cookie, nunca do navegador.
 */

const MIN_SENHA = 6;

export async function POST(request: NextRequest) {
  const session = await getSession();
  const login = session.user?.login;
  const userId = session.user?.id;
  if (!session.accessToken || !login || !userId) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }

  const limite = rateLimit(`senha:${userId}`, { max: 5, windowMs: 5 * 60_000 });
  if (!limite.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeconds) } },
    );
  }

  let corpo: { atual?: string; nova?: string; confirmacao?: string };
  try {
    corpo = (await request.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const atual = corpo.atual ?? "";
  const nova = corpo.nova ?? "";
  const confirmacao = corpo.confirmacao ?? "";

  if (!atual || !nova) {
    return NextResponse.json({ error: "Preencha todos os campos." }, { status: 400 });
  }
  if (nova !== confirmacao) {
    return NextResponse.json(
      { error: "A nova senha e a confirmação não são iguais." },
      { status: 400 },
    );
  }
  if (nova.length < MIN_SENHA) {
    return NextResponse.json(
      { error: `A nova senha precisa ter pelo menos ${MIN_SENHA} caracteres.` },
      { status: 400 },
    );
  }
  if (nova === atual) {
    // pega o caso mais comum aqui: sair do 123456 inicial e "trocar" para ele
    return NextResponse.json(
      { error: "A nova senha precisa ser diferente da atual." },
      { status: 400 },
    );
  }

  // 1) a senha atual está certa? Quem responde é o GLPI, não o portal.
  try {
    await passwordLogin(login, atual);
  } catch (err) {
    if (err instanceof GlpiAuthError) {
      return NextResponse.json({ error: "A senha atual está incorreta." }, { status: 400 });
    }
    console.error("Falha ao conferir a senha atual:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Falha ao falar com o sistema de chamados." }, { status: 502 });
  }

  // 2) grava a nova. O perfil self-service costuma não poder escrever em
  //    /Administration/User, então há o mesmo recuo para a conta de serviço
  //    usado na aprovação de solução.
  const corpoPatch = JSON.stringify({ password: nova, password2: nova });
  let trocou = false;
  try {
    const res = await v2Fetch(session.accessToken, `/Administration/User/${userId}`, {
      method: "PATCH",
      body: corpoPatch,
    });
    trocou = res.ok;
    if (!res.ok && res.status !== 401 && res.status !== 403) {
      const detalhe = (await res.text().catch(() => "")).slice(0, 200);
      console.error(`GLPI recusou a troca de senha (HTTP ${res.status}): ${detalhe}`);
      return NextResponse.json(
        { error: "O sistema de chamados não aceitou a nova senha. Tente outra." },
        { status: 400 },
      );
    }
  } catch {
    /* tratado pelo recuo abaixo */
  }

  if (!trocou) {
    const servico = await getServiceToken();
    if (!servico) {
      return NextResponse.json(
        { error: "Não foi possível trocar a senha agora. Fale com a equipe de TI." },
        { status: 502 },
      );
    }
    const res = await v2Fetch(servico, `/Administration/User/${userId}`, {
      method: "PATCH",
      body: corpoPatch,
    });
    if (!res.ok) {
      const detalhe = (await res.text().catch(() => "")).slice(0, 200);
      console.error(`Conta de serviço também recusou a troca (HTTP ${res.status}): ${detalhe}`);
      return NextResponse.json(
        { error: "O sistema de chamados não aceitou a nova senha. Tente outra." },
        { status: 400 },
      );
    }
  }

  // 3) renova a sessão com a senha nova — sem isto o cookie continuaria preso
  //    a um token emitido para a senha antiga, e a pessoa cairia no login no
  //    meio de um chamado, sem entender por quê
  try {
    const tokens = await passwordLogin(login, nova);
    session.accessToken = tokens.accessToken;
    session.refreshToken = tokens.refreshToken;
    session.tokenExpiresAt = tokens.expiresAt;
    await session.save();
  } catch {
    return NextResponse.json({
      ok: true,
      aviso: "Senha alterada! Entre novamente com a senha nova.",
    });
  }

  return NextResponse.json({ ok: true });
}
