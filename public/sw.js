/*
 * Service worker do Portal de Chamados TI.
 *
 * REGRA DE PRIVACIDADE: nenhuma página HTML é guardada em cache. As recepções
 * costumam compartilhar o mesmo computador — guardar a tela de um usuário
 * poderia mostrá-la para o próximo. Só ficam em cache os arquivos estáticos
 * (JS/CSS/ícones), que são iguais para todo mundo.
 *
 * Ao mudar este arquivo, suba a VERSAO para limpar o cache antigo.
 */

const VERSAO = "v2";
const CACHE = `portal-estatico-${VERSAO}`;
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icone-192.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;
  // a API nunca passa pelo service worker: dados de chamado são sempre frescos
  if (url.pathname.startsWith("/api/")) return;

  // navegação: sempre rede. Sem internet, mostra a página de aviso.
  if (requisicao.mode === "navigate") {
    evento.respondWith(fetch(requisicao).catch(() => caches.match(OFFLINE)));
    return;
  }

  // estáticos com nome versionado pelo Next: cache primeiro (são imutáveis)
  const estatico =
    url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?|css)$/.test(url.pathname);
  if (!estatico) return;

  evento.respondWith(
    caches.match(requisicao).then(
      (guardado) =>
        guardado ||
        fetch(requisicao).then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE).then((c) => c.put(requisicao, copia));
          }
          return resposta;
        }),
    ),
  );
});

/* ---------------- avisos no celular ---------------- */

self.addEventListener("push", (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = {};
  }
  const titulo = dados.titulo || "Suporte de TI";
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || "",
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      // mesma tag = o aviso novo substitui o antigo do mesmo chamado
      tag: dados.tag || "portal",
      renotify: true,
      data: { url: dados.url || "/chamados" },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "/chamados";

  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      // se o portal já estiver aberto, navega nele em vez de abrir outra aba
      for (const janela of janelas) {
        if (janela.url.includes(self.location.origin) && "focus" in janela) {
          janela.navigate(destino).catch(() => undefined);
          return janela.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
