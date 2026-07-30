import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { gravarConfig, lerConfig } from "./config-portal";

/**
 * Notificações no celular (roadmap Fase C).
 *
 * Guarda as inscrições dos navegadores num arquivo do servidor (o portal não
 * tem banco). As chaves VAPID — o par que identifica este servidor para os
 * serviços de push — são geradas sozinhas na primeira vez e ficam na mesma
 * configuração da tela ⚙️.
 *
 * Só dois avisos são enviados, por decisão de produto: técnico respondeu e
 * chamado resolvido. Nada de propaganda.
 */

export interface Inscricao {
  /** id do usuário no GLPI — é por ele que encontramos quem avisar */
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  criadaEm: string;
}

function arquivo(): string {
  const dir = process.env.PORTAL_DADOS_DIR ?? path.join(process.cwd(), "dados");
  return path.join(dir, "push-inscricoes.json");
}

async function lerInscricoes(): Promise<Inscricao[]> {
  try {
    const bruto = await fs.readFile(arquivo(), "utf8");
    const dados = JSON.parse(bruto) as unknown;
    return Array.isArray(dados) ? (dados as Inscricao[]) : [];
  } catch {
    return [];
  }
}

async function gravarInscricoes(lista: Inscricao[]): Promise<void> {
  const destino = arquivo();
  await fs.mkdir(path.dirname(destino), { recursive: true, mode: 0o700 });
  const temporario = `${destino}.tmp`;
  await fs.writeFile(temporario, JSON.stringify(lista, null, 2), { mode: 0o600 });
  await fs.rename(temporario, destino);
}

/** Chave pública VAPID; gera o par na primeira chamada. */
export async function chavePublica(): Promise<string> {
  const c = await lerConfig();
  if (c.pushPublica && c.pushPrivada) return c.pushPublica;
  const par = webpush.generateVAPIDKeys();
  await gravarConfig({ pushPublica: par.publicKey, pushPrivada: par.privateKey });
  return par.publicKey;
}

export async function inscrever(i: Omit<Inscricao, "criadaEm">): Promise<void> {
  const lista = await lerInscricoes();
  // um navegador só aparece uma vez: o endpoint é o identificador dele
  const semDuplicata = lista.filter((x) => x.endpoint !== i.endpoint);
  semDuplicata.push({ ...i, criadaEm: new Date().toISOString() });
  await gravarInscricoes(semDuplicata);
}

export async function desinscrever(endpoint: string): Promise<void> {
  const lista = await lerInscricoes();
  await gravarInscricoes(lista.filter((x) => x.endpoint !== endpoint));
}

export async function inscricoesDoUsuario(userId: number): Promise<Inscricao[]> {
  return (await lerInscricoes()).filter((x) => x.userId === userId);
}

export interface Aviso {
  titulo: string;
  corpo: string;
  /** para onde levar ao tocar */
  url: string;
  /** agrupa avisos do mesmo chamado, evitando empilhar */
  tag: string;
}

/**
 * Envia um aviso a todos os aparelhos de um usuário. Inscrição morta
 * (404/410 = app desinstalado ou permissão revogada) é removida sozinha.
 */
export async function avisar(userId: number, aviso: Aviso): Promise<number> {
  const c = await lerConfig();
  if (!c.pushLigado || !c.pushPublica || !c.pushPrivada) return 0;

  const alvos = await inscricoesDoUsuario(userId);
  if (alvos.length === 0) return 0;

  webpush.setVapidDetails("mailto:ti@prefeitura.local", c.pushPublica, c.pushPrivada);
  const carga = JSON.stringify(aviso);

  let enviados = 0;
  const mortas: string[] = [];
  await Promise.all(
    alvos.map(async (i) => {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          carga,
        );
        enviados++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) mortas.push(i.endpoint);
      }
    }),
  );

  if (mortas.length > 0) {
    const lista = await lerInscricoes();
    await gravarInscricoes(lista.filter((x) => !mortas.includes(x.endpoint)));
  }
  return enviados;
}
