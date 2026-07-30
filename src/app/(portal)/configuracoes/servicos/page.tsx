import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CATEGORIAS, chaveVisibilidade } from "@/config/categorias";
import { lerConfig } from "@/lib/config-portal";
import { listarSetores } from "@/lib/entidades";
import { getCurrentUser, GlpiAuthError } from "@/lib/glpi";
import { requireSession } from "@/lib/session";
import FormServicos, { type ServicoEditavel } from "./FormServicos";

export const dynamic = "force-dynamic";

/**
 * ⚙️ › Serviços por setor. Mesmo acesso da tela de configurações (perfil de
 * interface central, reconferido no GLPI a cada carga).
 *
 * Aqui a equipe decide o que cada setor enxerga ao abrir chamado. É ajuste de
 * tela, não de permissão: quem não achar o próprio caso continua chegando em
 * qualquer serviço pelo "ver todas as opções".
 */
export default async function ServicosPage() {
  const session = await requireSession();

  try {
    const me = await getCurrentUser(session.accessToken!);
    if (me?.profileInterface !== "central") notFound();
  } catch (err) {
    if (err instanceof GlpiAuthError) redirect("/login");
    throw err;
  }

  const [setores, config] = await Promise.all([listarSetores(), lerConfig()]);

  // achata cards e atalhos numa lista só — é assim que a tela edita
  const servicos: ServicoEditavel[] = [];
  for (const c of CATEGORIAS) {
    servicos.push({
      chave: chaveVisibilidade(c.slug),
      icone: c.icone,
      titulo: c.titulo,
      grupo: null,
      padrao: c.setores ?? null,
    });
    for (const a of c.atalhos ?? []) {
      servicos.push({
        chave: chaveVisibilidade(c.slug, a.slug),
        icone: c.icone,
        titulo: a.rotulo,
        grupo: c.titulo,
        padrao: a.setores ?? null,
      });
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/configuracoes" className="text-sm font-medium text-marca hover:underline">
        ← Voltar para Configurações
      </Link>
      <h2 className="mt-2 text-xl font-bold">Serviços por setor</h2>
      <p className="mt-1 text-gray-600">
        Escolha quais opções aparecem na abertura de chamado para cada setor. Marcar uma
        secretaria vale para tudo que está abaixo dela — inclusive setores criados depois.
      </p>
      <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
        Isto organiza a tela, não bloqueia ninguém: quem não achar o próprio caso usa o link
        <span className="font-medium"> “Não achei meu caso — ver todas as opções” </span>
        e continua chegando em qualquer serviço.
      </p>

      {setores.length === 0 ? (
        <p role="alert" className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-amber-900">
          Não foi possível ler os setores do GLPI agora. Sem essa lista não dá para editar as
          regras com segurança — tente de novo em instantes. Enquanto isso, tudo continua
          funcionando com as regras atuais.
        </p>
      ) : (
        <FormServicos servicos={servicos} setores={setores} inicial={config.visibilidade} />
      )}
    </main>
  );
}
