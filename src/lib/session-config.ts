import type { SessionOptions } from "iron-session";

/**
 * Configuração da sessão isolada das APIs do Next (next/headers), para que o
 * middleware (edge) possa importá-la sem puxar dependências de server
 * components.
 */

export interface SessionData {
  accessToken?: string;
  refreshToken?: string;
  /** epoch em ms — quando o access token expira */
  tokenExpiresAt?: number;
  user?: {
    id?: number;
    /** login do GLPI (digitado no portal) */
    login: string;
    /** nome amigável, se obtido da API */
    friendlyName?: string;
    /** interface do perfil GLPI: "central" (técnico/admin) ou "helpdesk" */
    profileInterface?: string;
    /** entidade (setor) ativa no GLPI — decide quais cards aparecem na abertura */
    entityId?: number;
  };
}

const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 horas (spec §6)

// validação preguiçosa: em produção o segredo é obrigatório, mas a checagem
// só pode acontecer em runtime (o build do Next avalia os módulos sem o .env)
export function sessionOptions(): SessionOptions {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET não definido no .env");
  }
  return {
    password: secret ?? "dev-only-secret-troque-em-producao-0123456789",
    cookieName: "chamados_ti_sessao",
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      // Secure exige HTTPS. SECURE_COOKIES=false permite acesso direto por
      // http:// enquanto o TLS (Cloudflare) não está na frente.
      secure:
        process.env.SECURE_COOKIES !== undefined
          ? process.env.SECURE_COOKIES === "true"
          : process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}
