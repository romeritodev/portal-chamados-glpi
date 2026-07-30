# Portal de Chamados — front-end amigável para o GLPI

[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)

Portal web para servidores abrirem e acompanharem chamados de TI **sem entrar no GLPI**.

O portal é uma casca: o **GLPI é a fonte da verdade**. Cada pessoa entra com o próprio
usuário do GLPI (OAuth2) e o chamado é criado com o token dela — por isso requerente e
entidade saem certos sem nenhum mapeamento, e o perfil self-service continua valendo.
Desligar o portal não perde nada.

> **Testado em:** GLPI 11.0.6 · Node.js 22 · Ubuntu 24.04.
> Em outras versões do GLPI, confira os pontos da seção *Armadilhas da API*.

## O que ele faz

**Para o servidor**
- Abertura em 4 passos, com atalhos que já escrevem a frase do problema
- Foto, anexo e **ditado por voz** (reconhecimento do próprio navegador, sem custo)
- Acompanhamento do chamado em linguagem simples, com conversa em bolhas e foto
- Confirmação da solução e nota de satisfação
- **PWA** instalável e **notificação push** no celular
- Troca da própria senha

**Para a equipe de TI**
- Filas prontas (minha fila, não atribuídos, vencendo hoje), filtro por setor e data
- **Kanban** com arrastar entre colunas e atalhos de teclado
- Triagem de um chamado por vez
- Registro de solução direto da conversa, com botões de fluxo
- **Relatórios** com satisfação, tempo de solução e quebra por categoria/setor
- **Botão de IA** para melhorar o texto da solução (opcional, chave própria)
- Tela ⚙️ para ligar/desligar recursos e escolher que serviços cada setor enxerga

## Instalação

### 1. No GLPI (uma vez, como admin)

**Cliente OAuth** — Configurar → Clientes OAuth → Adicionar
- Grants: **Password** · Scopes: **api**
- Guarde `client_id` e `client_secret`

**API legada** (necessária só para anexos — ver *Armadilhas*)
- Configurar → Geral → API: ative e crie um **App-Token**
- Na conta de serviço (abaixo), gere o **Token de API** pessoal

**Conta de serviço** — Administração → Usuários → Adicionar
- Perfil **Técnico**, recursivo na entidade raiz
- Usada só onde o perfil self-service não alcança: anexar documento, aprovar solução
  em nome do requerente e ler a árvore de entidades

**Categorias** — Configurar → Intitulados → Categorias ITIL
- O portal não cria categorias sozinho; veja *Adaptar para a sua prefeitura*

### 2. Servidor

```bash
apt update && apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
useradd -r -s /usr/sbin/nologin chamados
mkdir -p /opt/chamados-ti

nano /opt/chamados-ti/.env          # use .env.example como referência
chown chamados:chamados /opt/chamados-ti/.env
chmod 600 /opt/chamados-ti/.env

cp deploy/chamados-ti.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now chamados-ti
```

Gerar o `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Notificações push (opcional)

O envio é disparado de fora, por um temporizador do sistema — não por um laço dentro do
Next (que não sobrevive ao runtime de edge do middleware).

```bash
head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40   # PORTAL_CRON_TOKEN
cp deploy/chamados-avisos.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now chamados-avisos.timer
```

O par de chaves VAPID é gerado sozinho na primeira execução e guardado em
`<PORTAL_DADOS_DIR>/config.json`.

### 4. Rodar em desenvolvimento

```bash
cp .env.example .env
npm install
npm run dev      # http://localhost:3000
```

### 5. Deploy

```bash
./deploy/deploy.sh root@SEU-SERVIDOR
```

Faz o build standalone, monta o pacote e reinicia o serviço, preservando o `.env` do
servidor. Para HTTPS, use [deploy/nginx-proxy.conf.example](deploy/nginx-proxy.conf.example)
(ou um túnel do Cloudflare) com `client_max_body_size 12m;`.

## Adaptar para a sua prefeitura

**Esta é a parte que exige trabalho ao reaproveitar o projeto.** Dois pontos:

### Identificação da instituição

Uma linha no `.env` — não precisa mexer em código:

```
PORTAL_INSTITUICAO="Prefeitura de Exemplo"
```

Vale para o cabeçalho, a tela de login, o título da aba, o nome do aplicativo instalado
e o cabeçalho do relatório impresso.

### Categorias, setores e IDs

[src/config/categorias.ts](src/config/categorias.ts) é o coração do catálogo, e todos os
números nele são **da instância de origem** — não vão bater com a sua:

| O que | Onde conferir no seu GLPI |
|---|---|
| `categoriaId` de cada card e atalho | Configurar → Intitulados → Categorias ITIL |
| `SETOR` (ids de entidade) | Administração → Entidades |

Para listar os seus, com a conta de serviço autenticada:

```bash
curl -s "$GLPI_URL/api.php/v2/Dropdowns/ITILCategory?limit=200" -H "Authorization: Bearer $TOKEN"
curl -s "$GLPI_URL/api.php/v2/Administration/Entity?limit=200"  -H "Authorization: Bearer $TOKEN"
```

Enquanto não ajustar, use `categoriaId: null` (chamado sem categoria, o técnico
classifica) e remova os campos `setores` (todo mundo vê tudo).

**Vale montar o catálogo a partir dos seus chamados antigos, não da intuição.** No caso de
origem, ler 711 chamados revelou que "publicar no site" era 15% do volume e não tinha
categoria nenhuma, enquanto "e-mail" tinha card próprio para 1%.

## Armadilhas da API do GLPI

Descobertas na prática, todas custaram tempo:

- **Anexo:** a v2 desta versão cria o documento mas **não** cria o vínculo com o chamado.
  O portal usa a API legada (`apirest.php`) com a conta de serviço só para isso.
- **Lixeira não apaga:** chamado excluído volta na listagem com `is_deleted: true`.
  Filtre, ou ele reaparece nas filas e nos totais.
- **Paginação mente em silêncio:** uma requisição com `limit` fixo devolve só aquilo,
  sem sinal de corte. Percorra páginas até acabar.
- **Usuário desativado ainda recebe token:** o OAuth emite normalmente; a sessão vem sem
  `user_id`. Recuse o login quando não vier usuário.
- **Foto de perfil:** o endpoint é de leitura; escrever dá 403. Aqui as fotos ficam locais.
- **SLA/SLM não é criável pela API** (`ERROR_GLPI_ADD`) — configure na tela do GLPI.
- **Erro da API legada** vem como *lista* de strings, não objeto.
- **Campos:** o usuário é `username` (não `name`); `type` do chamado é inteiro puro
  (1 incidente, 2 requisição), enquanto `category` é objeto `{id}`.

Em divergência, **o OpenAPI da sua instância vence** (`{GLPI_URL}/api.php/doc`). Ajuste
apenas [src/lib/glpi.ts](src/lib/glpi.ts).

## Inteligência artificial (opcional)

Desligada por padrão. Na tela ⚙️ escolha o serviço — Anthropic, ou qualquer um compatível
com OpenAI (Gemini, Groq, DeepSeek, **Ollama local**) — e cadastre a chave, que fica só no
servidor. Há um botão de testar conexão.

Custo típico: menos de R$ 5/mês para ~100 chamados. Sem chave, o botão simplesmente não
aparece.

## O que NÃO fica no GLPI

Quase tudo é do GLPI. Ficam em `<PORTAL_DADOS_DIR>` (padrão `./dados`, permissão 0600):

| Arquivo | Conteúdo |
|---|---|
| `config.json` | Ajustes da tela ⚙️, chave da IA, par VAPID |
| `avaliacoes.json` | Índice das notas (o original vai como acompanhamento no chamado) |
| `avatares/` | Fotos de perfil |
| inscrições de push | Assinaturas dos navegadores |

**Faça backup dessa pasta.** Ela não vai para o Git e não está no GLPI.

## Segurança

- Sessão em cookie criptografado (`iron-session`), 8 h, `httpOnly`
- Tokens do GLPI **nunca** chegam ao navegador — toda chamada sai do servidor
- Limite de tentativas no login e na troca de senha
- Trocar a senha exige a senha atual, conferida por login real no GLPI
- HTML de entrada e saída é escapado
- `.env` e `dados/` fora do Git — **nunca commite credencial**

## Estrutura

```
src/
├── app/
│   ├── (portal)/            # telas autenticadas
│   │   ├── page.tsx         # abertura em 4 passos
│   │   ├── chamados/        # lista + detalhe
│   │   ├── painel/          # kanban e triagem
│   │   ├── relatorios/      # indicadores
│   │   ├── configuracoes/   # ⚙️ e serviços por setor
│   │   └── perfil/          # foto e senha
│   └── api/                 # route handlers
├── config/categorias.ts     # catálogo: cards, atalhos, IDs  ← ajuste aqui
└── lib/
    ├── glpi.ts              # cliente da API v2
    ├── glpi-legacy.ts       # apirest.php (anexos)
    ├── entidades.ts         # árvore de setores
    ├── config-portal.ts     # config da tela ⚙️
    ├── ia.ts                # camada de IA
    └── push.ts              # web push
```

## Licença

[MIT](LICENSE) — © 2026 Romerito Angelo Ribeiro.

Pode usar, adaptar e instalar na sua instituição, inclusive comercialmente. Basta manter
o aviso de copyright. O software é fornecido **como está, sem garantia**: quem instalar
assume o risco da própria operação.

Contribuições são bem-vindas por pull request.
