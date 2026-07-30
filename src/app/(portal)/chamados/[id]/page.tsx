import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import RastreadorChamado from "@/components/RastreadorChamado";
import { quaisTemAvatar } from "@/lib/avatares";
import { lerConfig } from "@/lib/config-portal";
import { caminhoDoSetor } from "@/lib/entidades";
import { statusChamado } from "@/lib/copy";
import { ehRequerente } from "@/lib/filas";
import {
  getPendingSolution,
  getTicket,
  getTicketDocuments,
  getTicketTimeline,
  GlpiAuthError,
  type PendingSolution,
  type TicketDocument,
  type TimelineItem,
} from "@/lib/glpi";
import { htmlToPlainText } from "@/lib/sanitize";
import { requireSession } from "@/lib/session";
import AprovacaoSolucao from "./AprovacaoSolucao";
import ComentarioForm from "./ComentarioForm";

export const dynamic = "force-dynamic";

function formataDataHora(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Só rotulamos o que muda o sentido da mensagem. "Acompanhamento" era ruído:
 * aparecia em cima de toda mensagem sem dizer nada — quem falou e quando já
 * está logo ao lado.
 */
function rotuloTimeline(type: string): string | null {
  if (/solution/i.test(type)) return "Solução";
  if (/task/i.test(type)) return "Tarefa interna";
  return null;
}

export default async function ChamadoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  let ticket;
  let timeline: TimelineItem[] = [];
  let anexos: TicketDocument[] = [];
  let solucaoPendente: PendingSolution | null = null;
  try {
    // as quatro consultas ao GLPI (remoto) rodam em paralelo — antes eram
    // sequenciais e somavam o tempo de ida-e-volta de cada uma
    const token = session.accessToken!;
    const [t, tl, docs] = await Promise.all([
      getTicket(token, id),
      getTicketTimeline(token, id),
      getTicketDocuments(token, id),
    ]);
    ticket = t;
    if (ticket) {
      timeline = tl;
      anexos = docs;
      if (ticket.status === 5) {
        solucaoPendente = await getPendingSolution(token, id);
      }
    }
  } catch (err) {
    if (err instanceof GlpiAuthError) redirect("/login");
    throw err;
  }

  if (!ticket) notFound();

  const meuId = session.user?.id;
  const souRequerente = ehRequerente(
    ticket,
    meuId,
    session.user?.profileInterface === "central",
  );
  // uma verificação só para toda a conversa, em vez de uma por mensagem
  const comFoto = await quaisTemAvatar(timeline.map((t) => t.authorId));

  // botão ✨ só existe com chave gravada e apoio ligado na tela ⚙️ — sem isso
  // ele seria um botão que só sabe dar erro
  const config = await lerConfig();
  const iaDisponivel = config.iaProvedor !== "desligado" && !!config.iaChave && config.iaSugestao;

  // Para a equipe: quem abriu e de onde. Sem isso, o técnico com vários
  // chamados abertos precisa voltar para a lista só para lembrar de qual
  // secretaria era aquele.
  const ehEquipe = session.user?.profileInterface === "central";
  const setorCompleto = ehEquipe
    ? await caminhoDoSetor(ticket.entityId, ticket.entityName)
    : "";

  const status = statusChamado(ticket.status);
  const solucionado = ticket.status === 5;
  const fechado = ticket.status === 6;

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link
          href="/chamados"
          className="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-marca hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          ← Voltar para meus chamados
        </Link>

        <div className="mt-3 rounded-2xl bg-superficie p-5 shadow">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">
                Chamado #{ticket.id} · aberto em {formataDataHora(ticket.date)}
              </p>
              <h2 className="mt-1 text-xl font-bold">{ticket.name}</h2>
              {ehEquipe && (ticket.requesterName || setorCompleto || ticket.categoryName) && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {ticket.requesterName && (
                    <span className="font-medium text-gray-700">👤 {ticket.requesterName}</span>
                  )}
                  {setorCompleto && (
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      🏛️ {setorCompleto}
                    </span>
                  )}
                  {ticket.categoryName && (
                    <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-marca">
                      {ticket.categoryName}
                    </span>
                  )}
                </p>
              )}
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${status.tag}`}>
              {status.label}
            </span>
          </div>

          <RastreadorChamado ticket={ticket} />

          {ticket.content && (
            <div className="mt-4 whitespace-pre-line rounded-lg bg-gray-50 p-4 text-gray-800">
              {htmlToPlainText(ticket.content)}
            </div>
          )}

          {anexos.length > 0 && (
            <div className="mt-4">
              <p className="font-medium text-gray-700">Anexos</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {anexos.map((doc) => {
                  const url = `/api/documentos/${doc.id}?chamado=${ticket!.id}`;
                  const ehImagem = doc.mime?.startsWith("image/");
                  return ehImagem ? (
                    <a key={doc.id} href={url} target="_blank" title={doc.name} className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={doc.name}
                        loading="lazy"
                        className="max-h-40 max-w-60 rounded-lg border border-gray-200 object-cover hover:opacity-90"
                      />
                    </a>
                  ) : (
                    <a
                      key={doc.id}
                      href={url}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      📎 {doc.name}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {solucionado && !solucaoPendente && (
            <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
              Este chamado foi marcado como <strong>solucionado</strong>. Se o problema continuar,
              entre em contato com a equipe de TI informando o número #{ticket.id}.
            </p>
          )}
        </div>

        {/* aceitar, recusar e avaliar é do requerente — o técnico que resolveu
            não dá o próprio trabalho por aprovado; para ele fica só o aviso */}
        {solucaoPendente &&
          (souRequerente ? (
            <AprovacaoSolucao ticketId={ticket.id} />
          ) : (
            <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              ⏳ Aguardando {ticket.requesterName ?? "o usuário"} confirmar se a solução funcionou.
            </p>
          ))}

        <h3 className="mt-6 text-lg font-bold">Andamento</h3>
        {timeline.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-superficie p-5 text-gray-600 shadow">
            Ainda não há atualizações neste chamado.
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {timeline.map((item, i) => {
              const solucao = /solution/i.test(item.type);
              const rotulo = rotuloTimeline(item.type);
              // mensagem minha fica de um lado, a da equipe do outro — como
              // numa conversa, para reconhecer quem falou sem precisar ler
              const souEu = item.authorId !== undefined && item.authorId === meuId;
              return (
                <li key={i} className={`flex items-start gap-2 ${souEu ? "flex-row-reverse" : ""}`}>
                  <Avatar
                    userId={item.authorId}
                    nome={item.authorName}
                    temFoto={item.authorId !== undefined && comFoto.has(item.authorId)}
                  />
                  <div
                    className={`max-w-[85%] min-w-0 rounded-2xl border p-3.5 shadow-sm ${
                      solucao
                        ? "border-green-200 bg-green-50"
                        : souEu
                          ? "border-brand-200 bg-brand-50"
                          : "border-gray-200 bg-superficie"
                    }`}
                  >
                    <p className="text-xs text-gray-500">
                      {rotulo && (
                        <span className={`font-semibold ${solucao ? "text-sucesso" : "text-gray-700"}`}>
                          {rotulo} ·{" "}
                        </span>
                      )}
                      <span className="font-medium text-gray-700">
                        {souEu ? "Você" : (item.authorName ?? "Equipe de TI")}
                      </span>
                      {item.date ? ` · ${formataDataHora(item.date)}` : ""}
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-gray-800">
                      {htmlToPlainText(item.content)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {fechado ? (
          <p className="mt-4 rounded-2xl bg-gray-100 p-4 text-sm text-gray-600">
            Este chamado está fechado. Se o problema voltou, abra um novo chamado.
          </p>
        ) : (
          <ComentarioForm
            ticketId={ticket.id}
            podeResolver={session.user?.profileInterface === "central"}
            statusAtual={ticket.status}
            iaDisponivel={iaDisponivel}
          />
        )}
      </main>
    </>
  );
}
