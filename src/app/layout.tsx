import type { Metadata, Viewport } from "next";
import { nomeInstituicao } from "@/lib/instituicao";
import "./globals.css";

// função, e não objeto fixo: assim o nome é lido a cada requisição e trocar
// o .env basta. Como objeto no topo do módulo, o valor poderia ficar preso
// ao que existia no momento do build.
export async function generateMetadata(): Promise<Metadata> {
  return {
  title: `Suporte de TI — ${nomeInstituicao()}`,
  description: "Portal de abertura e acompanhamento de chamados de TI",
  applicationName: "Suporte de TI",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  // abre em tela cheia quando adicionado à tela inicial do iPhone
  appleWebApp: {
    capable: true,
    title: "Suporte de TI",
    statusBarStyle: "black-translucent",
  },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // pinta a barra do navegador com a cor do cabeçalho
  themeColor: "#1e3a8a",
};

/*
 * Aplica o tema escolhido ANTES da primeira pintura. Sem isto a tela nasceria
 * clara e piscaria para escura logo em seguida.
 */
const aplicaTema = `try{if(localStorage.getItem('portal_tema')==='escuro')document.documentElement.dataset.tema='escuro'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: aplicaTema }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
