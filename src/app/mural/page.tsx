import { notFound, redirect } from "next/navigation";
import { ehAtribuidoA } from "@/lib/filas";
import { getCurrentUser, GlpiAuthError, isOpenStatus, listMyTickets } from "@/lib/glpi";
import { requireSession } from "@/lib/session";
import Mural, { type ChamadoNoMural, type DadosMural } from "./Mural";

export const dynamic = "force-dynamic";

/**
 * Mural de parede (estilo NOC) para a TV da sala da TI.
 *
 * Fora do grupo (portal) de propósito: cabeçalho e barra inferior existem
 * para quem navega, e numa tela que ninguém toca só roubam espaço.
 *
 * UMA leitura do GLPI serve a tudo — fila e indicadores saem do mesmo lote.
 * A tela se atualiza a cada 30s; buscar duas vezes seria dobrar o tráfego
 * contra o GLPI o dia inteiro, para os mesmos chamados.
 */

const LIMITE = 5000;

function dataDe(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function MuralPage() {
  const session = await requireSession();

  let dados: DadosMural;
  try {
    const me = await getCurrentUser(session.accessToken!);
    if (me?.profileInterface !== "central") notFound();

    const tickets = await listMyTickets(session.accessToken!, LIMITE);
    const meuId = me.id ?? session.user?.id;
    const meuNome = me.friendlyName ?? "";

    // status 5 entra junto: é trabalho FEITO esperando o usuário confirmar.
    // Fora da tela, o mural dava a impressão de que ninguém resolveu nada.
    const abertos: ChamadoNoMural[] = tickets
      .filter((t) => isOpenStatus(t.status) || t.status === 5)
      .map((t) => ({
        id: t.id,
        titulo: t.name,
        setor: t.entityName ?? "",
        requerente: t.requesterName ?? "",
        status: t.status,
        urgencia: t.urgency ?? 2,
        abertoEm: t.date ?? "",
        semDono: t.assignees.length === 0,
        // num mural de equipe, "quem está com isso" é a pergunta que mais se
        // faz em voz alta na sala
        responsavel: t.assignees.map((a) => a.name).filter(Boolean)[0] ?? "",
        meu: ehAtribuidoA(t, meuId, meuNome),
      }))
      // mais urgente primeiro; empatou, mais antigo primeiro — quem espera há
      // mais tempo aparece antes
      .sort((a, b) => b.urgencia - a.urgencia || a.id - b.id);

    // --- indicadores do dia ---
    const hoje = new Date();
    const inicioDeHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

    const resolvidosHoje = tickets.filter((t) => {
      const s = dataDe(t.solveDate);
      return s !== null && s >= inicioDeHoje;
    }).length;

    const abertosHoje = tickets.filter((t) => {
      const d = dataDe(t.date);
      return d !== null && d >= inicioDeHoje;
    }).length;

    // tempo médio de solução dos últimos 30 dias, em horas
    const trintaDias = new Date(inicioDeHoje.getTime() - 30 * 24 * 3600 * 1000);
    const horas: number[] = [];
    for (const t of tickets) {
      const a = dataDe(t.date);
      const s = dataDe(t.solveDate);
      if (!a || !s || s < trintaDias) continue;
      const h = (s.getTime() - a.getTime()) / 3600000;
      if (h >= 0) horas.push(h);
    }
    const tempoMedioHoras =
      horas.length > 0 ? horas.reduce((x, y) => x + y, 0) / horas.length : null;

    // --- série dos últimos 7 dias (abertos por dia) ---
    const porDia = Array.from({ length: 7 }, (_, i) => {
      const dia = new Date(inicioDeHoje.getTime() - (6 - i) * 24 * 3600 * 1000);
      const fim = new Date(dia.getTime() + 24 * 3600 * 1000);
      const qtd = tickets.filter((t) => {
        const d = dataDe(t.date);
        return d !== null && d >= dia && d < fim;
      }).length;
      return {
        rotulo: dia.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
        dia: dia.getDate(),
        qtd,
        hoje: dia.getTime() === inicioDeHoje.getTime(),
      };
    });

    // --- onde estão os abertos (top categorias) ---
    const contagem = new Map<string, number>();
    for (const c of abertos.filter((x) => x.status !== 5)) {
      const t = tickets.find((x) => x.id === c.id);
      const nome = t?.categoryName?.trim() || "Sem categoria";
      contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
    }
    const porCategoria = [...contagem.entries()]
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 5);

    // "o quê" (categoria) responde uma pergunta; "onde" (setor) responde
    // outra, e é a que revela problema concentrado num lugar só
    const porSetorMapa = new Map<string, number>();
    for (const c of abertos.filter((x) => x.status !== 5)) {
      const nome = c.setor.trim() || "Sem setor";
      porSetorMapa.set(nome, (porSetorMapa.get(nome) ?? 0) + 1);
    }
    const porSetor = [...porSetorMapa.entries()]
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 5);

    dados = {
      abertos,
      resolvidosHoje,
      abertosHoje,
      tempoMedioHoras,
      porDia,
      porCategoria,
      porSetor,
    };
  } catch (err) {
    if (err instanceof GlpiAuthError) redirect("/login");
    throw err;
  }

  return <Mural dados={dados} />;
}
