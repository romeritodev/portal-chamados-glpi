import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { lerConfig } from "@/lib/config-portal";
import { ehAtribuidoA, slaVisual } from "@/lib/filas";
import { getCurrentUser, GlpiAuthError, listMyTickets } from "@/lib/glpi";
import { STATUS_NO_PAINEL, type CartaoChamado } from "@/lib/painel";
import { requireSession } from "@/lib/session";
import Kanban from "./Kanban";

export const dynamic = "force-dynamic";

/**
 * Painel de atendimento (kanban) — roadmap Fase B, só para a equipe de TI.
 * O perfil é reconferido no GLPI a cada carga (mesma regra dos relatórios):
 * mudar o perfil lá tira o acesso aqui sem depender do cookie da sessão.
 * Desligável na tela ⚙️ (padrão inicial: PORTAL_PAINEL no .env).
 */

// alto de propósito: a busca para sozinha no fim dos registros. Com teto
// baixo, um chamado aberto antigo simplesmente não aparecia no kanban.
const LIMITE = 5000;

export default async function PainelPage() {
  const config = await lerConfig();
  if (!config.painel) notFound();

  const session = await requireSession();

  let cartoes: CartaoChamado[];
  try {
    const me = await getCurrentUser(session.accessToken!);
    if (me?.profileInterface !== "central") notFound();

    const tickets = await listMyTickets(session.accessToken!, LIMITE);
    const meuId = me.id ?? session.user?.id;
    const meuNome = me.friendlyName ?? session.user?.friendlyName;

    cartoes = tickets
      .filter((t) => STATUS_NO_PAINEL.has(t.status))
      .map((t) => {
        const meu = ehAtribuidoA(t, meuId, meuNome);
        const responsaveis = t.assignees.map((a) => a.name).filter(Boolean) as string[];
        return {
          id: t.id,
          nome: t.name,
          status: t.status,
          setor: t.entityName,
          requerente: t.requesterName,
          urgencia: t.urgency,
          categoria: t.categoryName,
          responsavel: responsaveis[0],
          meu,
          semDono: responsaveis.length === 0,
          // prazo calculado aqui (servidor) — o cliente só exibe
          sla: slaVisual(t.timeToResolve, t.status !== 5) ?? undefined,
        };
      });
  } catch (err) {
    if (err instanceof GlpiAuthError) redirect("/login");
    throw err;
  }

  const novos = cartoes.filter((c) => c.status === 1).length;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Painel de atendimento</h2>
        {novos > 0 && (
          <Link
            href="/painel/triagem"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
          >
            ⚡ Triar {novos} {novos === 1 ? "chamado novo" : "chamados novos"}
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Arraste os cards entre as colunas para mudar a situação. No celular, use o botão{" "}
        <span className="font-semibold">⋯</span> de cada card. Ao mover para{" "}
        <span className="font-semibold">Resolvidos</span>, o portal pede o que foi feito — é esse
        texto que o usuário lê para confirmar se funcionou. Aperte{" "}
        <kbd className="rounded border border-gray-300 border-b-2 bg-gray-100 px-1.5 font-mono text-xs text-gray-700">
          ?
        </kbd>{" "}
        para ver os atalhos de teclado.
      </p>
      <Kanban inicial={cartoes} />
    </main>
  );
}
