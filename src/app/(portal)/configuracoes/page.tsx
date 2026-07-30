import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { lerConfigPublica } from "@/lib/config-portal";
import { getCurrentUser, GlpiAuthError } from "@/lib/glpi";
import { requireSession } from "@/lib/session";
import FormConfig from "./FormConfig";

export const dynamic = "force-dynamic";

/**
 * Tela de configurações da equipe de TI (roadmap Fase B). O perfil é
 * reconferido no GLPI a cada carga — mudar o perfil lá tira o acesso aqui.
 * A configuração chega ao navegador sem a chave da IA (ver config-portal.ts).
 */
export default async function ConfiguracoesPage() {
  const session = await requireSession();

  try {
    const me = await getCurrentUser(session.accessToken!);
    if (me?.profileInterface !== "central") notFound();
  } catch (err) {
    if (err instanceof GlpiAuthError) redirect("/login");
    throw err;
  }

  const config = await lerConfigPublica();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h2 className="text-xl font-bold">Configurações</h2>
      <p className="mt-1 text-gray-600">
        Ajustes do portal. Visível apenas para a equipe de TI.
      </p>
      <Link
        href="/configuracoes/servicos"
        className="mt-4 flex min-h-14 items-center gap-3 rounded-xl border border-gray-200 bg-superficie p-4 shadow-sm transition hover:border-brand-600 hover:shadow"
      >
        <span aria-hidden className="text-2xl">🗂️</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Serviços por setor</span>
          <span className="block text-sm text-gray-600">
            Escolher quais opções aparecem na abertura de chamado para cada secretaria
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-gray-400">›</span>
      </Link>

      <FormConfig inicial={config} />
    </main>
  );
}
