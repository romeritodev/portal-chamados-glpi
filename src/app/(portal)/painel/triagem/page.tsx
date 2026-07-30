import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { lerConfig } from "@/lib/config-portal";
import { getCurrentUser, GlpiAuthError, listMyTickets } from "@/lib/glpi";
import { htmlToPlainText } from "@/lib/sanitize";
import { requireSession } from "@/lib/session";
import Triagem, { type ChamadoTriagem } from "./Triagem";

export const dynamic = "force-dynamic";

/**
 * Triagem estilo "caixa de entrada zerada" (roadmap Fase B): um chamado novo
 * por vez, decisão em uma tecla, avanço automático. Serve para o começo do
 * expediente, quando chegaram vários chamados de uma vez.
 */

// ver comentário em painel/page.tsx: a paginação para sozinha no fim
const LIMITE = 5000;

export default async function TriagemPage() {
  const config = await lerConfig();
  if (!config.painel) notFound();

  const session = await requireSession();

  let fila: ChamadoTriagem[];
  try {
    const me = await getCurrentUser(session.accessToken!);
    if (me?.profileInterface !== "central") notFound();

    const tickets = await listMyTickets(session.accessToken!, LIMITE);
    fila = tickets
      .filter((t) => t.status === 1)
      .sort((a, b) => a.id - b.id) // mais antigo primeiro: ninguém fica esquecido
      .map((t) => ({
        id: t.id,
        nome: t.name,
        descricao: htmlToPlainText(t.content ?? "").slice(0, 900),
        setor: t.entityName,
        requerente: t.requesterName,
        abertoEm: t.date,
        semDono: t.assignees.length === 0,
      }));
  } catch (err) {
    if (err instanceof GlpiAuthError) redirect("/login");
    throw err;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href="/painel"
        className="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-marca hover:underline"
      >
        ← Voltar para o painel
      </Link>
      <h2 className="mt-2 text-xl font-bold">Triagem</h2>
      <p className="mt-1 text-sm text-gray-600">
        Um chamado por vez. Decida com uma tecla e o próximo aparece sozinho.
      </p>
      <Triagem inicial={fila} />
    </main>
  );
}
