import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionOptions, type SessionData } from "./session-config";

export { sessionOptions, type SessionData } from "./session-config";

export type Session = IronSession<SessionData>;

export async function getSession(): Promise<Session> {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export function isLoggedIn(session: SessionData): boolean {
  return Boolean(session.accessToken);
}

/**
 * Para uso em páginas (server components): exige sessão ativa,
 * senão redireciona para o login.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!isLoggedIn(session)) {
    redirect("/login");
  }
  return session;
}
