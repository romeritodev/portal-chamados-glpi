import { CATEGORIAS, chaveVisibilidade, setoresEfetivos, visivelPara } from "@/config/categorias";
import { lerConfig } from "@/lib/config-portal";
import { cadeiaDeSetores } from "@/lib/entidades";
import { requireSession } from "@/lib/session";
import NovoChamado from "./NovoChamado";

export default async function HomePage() {
  const session = await requireSession();
  const nome = session.user?.friendlyName || session.user?.login || "";

  // Cards e atalhos do setor da pessoa. A regra é a da tela ⚙️ › Serviços
  // quando existe, senão o padrão de config/categorias.ts.
  //
  // Mandamos a lista COMPLETA com a marca `doSetor`, não a lista filtrada: o
  // link "não achei meu caso" precisa revelar o resto na hora, sem ida ao
  // servidor. Nada aqui é segredo — é organização de tela.
  const [cadeia, config] = await Promise.all([
    cadeiaDeSetores(session.user?.entityId),
    lerConfig(),
  ]);
  const ajustes = config.visibilidade;
  const mostra = (padrao: number[] | undefined, chave: string) =>
    visivelPara(setoresEfetivos(padrao, chave, ajustes), cadeia);

  return (
    // âncora do botão "+ Abrir" da barra inferior do celular.
    // A saudação vive dentro do NovoChamado: a partir do passo 2 ela sai da
    // tela, que no celular é disputada com o teclado.
    <main id="abrir" className="mx-auto max-w-3xl scroll-mt-4 px-4 py-5">
      <NovoChamado
        nome={nome}
        // o browser recebe rótulo e texto dos atalhos, nunca o número da
        // categoria no GLPI — esse mapeamento é resolvido no servidor
        categorias={CATEGORIAS.map((c) => ({
          slug: c.slug,
          titulo: c.titulo,
          descricao: c.descricao,
          icone: c.icone,
          formulario: c.formulario,
          doSetor: mostra(c.setores, chaveVisibilidade(c.slug)),
          atalhos: c.atalhos?.map((a) => ({
            slug: a.slug,
            rotulo: a.rotulo,
            texto: a.texto,
            ajuda: a.ajuda,
            doSetor: mostra(a.setores, chaveVisibilidade(c.slug, a.slug)),
          })),
        }))}
      />
    </main>
  );
}
