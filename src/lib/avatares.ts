import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Foto de perfil dos usuários (roadmap — pedido do usuário).
 *
 * Guardada no próprio portal: as rotas de foto do GLPI são somente leitura
 * (não existe upload pela API) e ainda devolvem 403 para a conta do portal —
 * verificado em 25/07/2026. Então o arquivo mora em dados/avatares/<id>.jpg.
 *
 * A imagem já chega quadrada e reduzida do navegador; aqui só validamos e
 * gravamos.
 */

export const AVATAR_MAX_BYTES = 400 * 1024;
export const AVATAR_TIPOS = ["image/jpeg", "image/png", "image/webp"];

function pasta(): string {
  const dir = process.env.PORTAL_DADOS_DIR ?? path.join(process.cwd(), "dados");
  return path.join(dir, "avatares");
}

function caminho(userId: number): string {
  return path.join(pasta(), `${userId}.jpg`);
}

export async function temAvatar(userId: number): Promise<boolean> {
  try {
    await fs.access(caminho(userId));
    return true;
  } catch {
    return false;
  }
}

/** Quais destes usuários têm foto — uma consulta só, para a conversa. */
export async function quaisTemAvatar(ids: (number | undefined)[]): Promise<Set<number>> {
  const unicos = [...new Set(ids.filter((i): i is number => typeof i === "number"))];
  const achados = await Promise.all(
    unicos.map(async (id) => ((await temAvatar(id)) ? id : null)),
  );
  return new Set(achados.filter((i): i is number => i !== null));
}

export async function lerAvatar(userId: number): Promise<Buffer | null> {
  try {
    return await fs.readFile(caminho(userId));
  } catch {
    return null;
  }
}

export async function gravarAvatar(userId: number, dados: Buffer): Promise<void> {
  await fs.mkdir(pasta(), { recursive: true, mode: 0o700 });
  const destino = caminho(userId);
  const temporario = `${destino}.tmp`;
  await fs.writeFile(temporario, dados, { mode: 0o600 });
  await fs.rename(temporario, destino);
}

export async function removerAvatar(userId: number): Promise<void> {
  await fs.unlink(caminho(userId)).catch(() => undefined);
}

// A aparência sem foto (iniciais e cor) vive em lib/iniciais.ts: aquele
// módulo também roda no navegador, este não.
