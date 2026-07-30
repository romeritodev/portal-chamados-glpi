import type { MetadataRoute } from "next";
import { nomeInstituicao } from "@/lib/instituicao";

/**
 * Manifesto do aplicativo instalável (roadmap Fase C).
 * Com ele o portal ganha ícone na tela inicial do celular e abre em tela
 * cheia, sem a barra de endereço — o servidor não lembra a URL, lembra o ícone.
 */
/**
 * Sem isto o manifesto seria gerado no build e ficaria com o nome que existia
 * naquele momento: trocar PORTAL_INSTITUICAO no .env atualizaria cabeçalho,
 * login e relatório, e deixaria o aplicativo instalado com o nome antigo —
 * o lugar mais difícil de perceber que ficou errado.
 */
export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `Suporte de TI — ${nomeInstituicao()}`,
    short_name: "Suporte de TI",
    description: "Abra e acompanhe seus chamados de TI.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f9fafb",
    theme_color: "#1e3a8a",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Abrir chamado", short_name: "Abrir", url: "/#abrir" },
      { name: "Meus chamados", short_name: "Chamados", url: "/chamados" },
    ],
  };
}
