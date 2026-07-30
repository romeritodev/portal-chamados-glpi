import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { lerConfig } from "./config-portal";
import { epochDe } from "./filas";
import { getServiceToken, getTicketTimeline, listMyTickets } from "./glpi";
import { avisar } from "./push";

/**
 * Vigia dos chamados (roadmap Fase C): procura o que mudou no GLPI e avisa o
 * requerente no celular.
 *
 * É chamado de fora, por um temporizador do sistema, através de
 * POST /api/push/verificar — e não por um laço dentro do Next. Assim o ciclo
 * aparece no journalctl, some junto com o serviço num deploy e pode ser
 * disparado à mão para teste.
 *
 * Uma consulta por passada, independentemente de quantos usuários existem —
 * pega os chamados ordenados por data de modificação e olha só os que mudaram
 * desde a última vez. Importante no CT de 1 vCPU.
 *
 * Só dois avisos, por decisão de produto:
 *   • o técnico respondeu no seu chamado
 *   • o chamado foi resolvido (precisa da sua confirmação)
 */

/** após uma parada longa, não despejar avisos velhos no celular de ninguém */
const JANELA_MAXIMA_MS = 30 * 60_000;
const LIMITE = 60;

function arquivoEstado(): string {
  const dir = process.env.PORTAL_DADOS_DIR ?? path.join(process.cwd(), "dados");
  return path.join(dir, "push-estado.json");
}

async function lerUltimaVerificacao(): Promise<number> {
  try {
    const bruto = await fs.readFile(arquivoEstado(), "utf8");
    const d = JSON.parse(bruto) as { ultimaVerificacao?: number };
    return typeof d.ultimaVerificacao === "number" ? d.ultimaVerificacao : 0;
  } catch {
    return 0;
  }
}

async function gravarUltimaVerificacao(quando: number): Promise<void> {
  const destino = arquivoEstado();
  await fs.mkdir(path.dirname(destino), { recursive: true, mode: 0o700 });
  await fs.writeFile(destino, JSON.stringify({ ultimaVerificacao: quando }), { mode: 0o600 });
}

/** Foi o técnico que mexeu, ou o próprio requerente? */
async function respostaDeOutro(
  token: string,
  ticketId: number,
  requesterId: number,
): Promise<boolean> {
  try {
    const linha = await getTicketTimeline(token, ticketId);
    const ultimo = linha.at(-1);
    if (!ultimo) return false;
    // sem id de autor não dá para ter certeza — melhor não avisar do que avisar errado
    if (ultimo.authorId === undefined) return false;
    return ultimo.authorId !== requesterId;
  } catch {
    return false;
  }
}

/** Uma passada. Devolve quantos avisos saíram. */
export async function verificarUmaVez(): Promise<{ avisos: number; olhados: number }> {
  const config = await lerConfig();
  if (!config.pushLigado) return { avisos: 0, olhados: 0 };

  const token = await getServiceToken();
  if (!token) return { avisos: 0, olhados: 0 };

  const agora = Date.now();
  const ultima = await lerUltimaVerificacao();
  // primeira execução (ou parada longa): olha só a janela recente
  const corte = ultima > 0 ? Math.max(ultima, agora - JANELA_MAXIMA_MS) : agora - 60_000;

  const tickets = await listMyTickets(token, LIMITE, "date_mod:desc");
  let avisos = 0;
  let olhados = 0;

  for (const t of tickets) {
    const mudouEm = epochDe(t.date_mod);
    if (mudouEm <= corte) break; // a lista vem ordenada: daqui para trás é tudo antigo
    olhados++;
    if (!t.requesterId) continue;

    if (t.status === 5) {
      avisos += await avisar(t.requesterId, {
        titulo: "Seu chamado foi resolvido ✅",
        corpo: `#${t.id} — ${t.name}. Confirme se funcionou.`,
        url: `/chamados/${t.id}`,
        tag: `chamado-${t.id}`,
      });
      continue;
    }

    if (await respostaDeOutro(token, t.id, t.requesterId)) {
      avisos += await avisar(t.requesterId, {
        titulo: "A equipe de TI respondeu 💬",
        corpo: `#${t.id} — ${t.name}`,
        url: `/chamados/${t.id}`,
        tag: `chamado-${t.id}`,
      });
    }
  }

  await gravarUltimaVerificacao(agora);
  if (avisos > 0) console.log(`[vigia] ${avisos} aviso(s) enviado(s)`);
  return { avisos, olhados };
}
