# Especificação Técnica — Portal de Chamados TI

**Projeto:** Chamados-TI — Portal amigável de abertura de chamados integrado ao GLPI
**Organização:** prefeitura municipal de pequeno porte
**Data:** Julho/2026
**Autor da spec:** Equipe de TI (documento gerado para orientar desenvolvimento com Claude Code)

---

## 1. Objetivo

Criar um portal web simples e amigável onde os servidores da prefeitura (recepções de PSF, RH, escolas, secretarias etc.) abrem e acompanham chamados de TI **sem acessar a interface do GLPI diretamente**. O portal é apenas um front-end: **o GLPI 11.0.6 continua sendo a fonte da verdade** (workflow, SLA, histórico, relatórios). Nenhum dado de chamado é armazenado no portal — tudo é lido e gravado via API do GLPI.

Princípio central: **o usuário loga com o próprio login do GLPI**, e o chamado criado herda automaticamente o usuário requerente e a entidade dele (ex.: login `Recepção-PSF1` → chamado nasce na entidade correta da árvore `Entidade raiz > Prefeitura Municipal > Secretaria de Saúde > Psf-...`). O portal NÃO deve implementar mapeamento manual de setores.

---

## 2. Contexto de infraestrutura

| Item | Detalhe |
|---|---|
| GLPI | Versão **11.0.6**, rodando na VM 400 (`GLPI-TI`) no Proxmox, node `pve3` |
| URL interna do GLPI | `http://<IP_DA_VM_GLPI>` — **PREENCHER** (placeholder: `GLPI_URL`) |
| Host do portal | **CT 410** (LXC), hostname `Chamado-Ti`, Ubuntu 24.04, 1 vCPU, 2 GB RAM, 512 MB swap, 10 GB disco, unprivileged, nesting=1 |
| IP do CT | `<ip-interno-do-portal>` (rede interna, bridge vmbr0) |
| Proxy reverso | VM `nginx-proxy` — fará o TLS e o roteamento público → porta 3000 do portal |
| Desenvolvimento | Windows, deploy via SSH para o CT 410 |

Restrição de recursos: o CT tem apenas 1 vCPU e 2 GB de RAM. A aplicação deve ser leve (evitar dependências pesadas, sem banco de dados próprio, sem Redis — sessão em memória ou cookie assinado é suficiente).

---

## 3. Stack técnica

- **Node.js 22 LTS**
- **Next.js 15+ (App Router)** com build standalone (`output: 'standalone'` no `next.config`) para reduzir consumo no CT
- **TypeScript**
- **Tailwind CSS** para o estilo
- Sessão: cookie **httpOnly, Secure, SameSite=Lax**, assinado/criptografado (ex.: `iron-session`), contendo apenas o access token OAuth do usuário e dados básicos (nome, id). **Nunca armazenar a senha do usuário.**
- Sem banco de dados. Sem ORM. Estado vive no GLPI.
- Todas as chamadas à API do GLPI acontecem **no servidor (route handlers / server actions)** — o browser do usuário nunca fala direto com o GLPI e nunca vê tokens de cliente OAuth.

---

## 4. Integração com o GLPI 11

### 4.1 Autenticação — OAuth2 Password Grant (API high-level, `/api.php`)

Pré-requisito no GLPI (feito manualmente pelo admin, não pelo código):

1. GLPI → **Configurar → Clientes OAuth → Adicionar**
2. Grants: **Password** (o grant `client_credentials` NÃO funciona para o escopo `api`)
3. Scopes: **api**
4. Anotar `client_id` e `client_secret` → vão para o `.env` do portal

Fluxo de login do portal:

```
POST {GLPI_URL}/api.php/token
Content-Type: application/json
{
  "grant_type": "password",
  "client_id": "<OAUTH_CLIENT_ID>",
  "client_secret": "<OAUTH_CLIENT_SECRET>",
  "username": "<login digitado pelo usuário>",
  "password": "<senha digitada pelo usuário>",
  "scope": "api"
}
```

Resposta: `access_token` (+ `refresh_token` e `expires_in`). Guardar o access token na sessão (cookie criptografado). Implementar renovação via refresh token quando disponível; se expirar sem refresh, redirecionar para login.

### 4.2 Endpoints principais (API high-level v2)

A API v2 é autodocumentada. **Primeira tarefa do desenvolvimento: consultar o OpenAPI/Swagger do próprio servidor em `{GLPI_URL}/api.php/doc` (e o guia em `{GLPI_URL}/api.php/getting-started`) e validar os schemas reais antes de fixar os payloads.** Os caminhos abaixo são a referência esperada, mas o schema do servidor manda:

- Sessão/usuário atual: dados do usuário autenticado (nome, entidade ativa)
- Listar chamados do usuário: `GET {GLPI_URL}/api.php/v2/Assistance/Ticket` — a API já restringe ao que o perfil do usuário pode ver (perfil self-service vê os próprios chamados)
- Criar chamado: `POST {GLPI_URL}/api.php/v2/Assistance/Ticket` com ao menos `name` (título), `content` (descrição em HTML simples ou texto), `urgency` e categoria (`itilcategories_id` / campo de categoria conforme schema)
- Detalhe de um chamado + acompanhamentos (timeline/followups) conforme endpoints do schema
- Categorias ITIL: buscar via API para montar o catálogo de opções

Fixar a versão nas URLs (`/api.php/v2/...`) para evitar quebra em versões futuras.

### 4.3 Fallback — API legada v1 (`apirest.php`)

A API legada continua funcional no GLPI 11 (deprecated). Usar **somente** se algum recurso não estiver disponível na v2 — o caso mais provável é **upload de anexos** (na v1: `initSession` com Basic Auth + App-Token, depois `POST /apirest.php/Document` multipart vinculando ao ticket). Se precisar dela:

1. GLPI → Configurar → Geral → API: habilitar a API legada e criar um App-Token
2. Adicionar `GLPI_LEGACY_APP_TOKEN` ao `.env`
3. O `initSession` deve ser feito com as credenciais do próprio usuário (repassadas no momento do login) — nunca com uma conta de serviço, para preservar a entidade correta

Se anexos funcionarem bem pela v2, ignorar esta seção.

---

## 5. Funcionalidades (escopo do MVP)

### 5.1 Tela de login (`/login`)
- Campos: usuário e senha (credenciais do GLPI)
- Mensagem de erro clara em caso de credencial inválida ("Usuário ou senha incorretos")
- Rate limiting simples no endpoint de login (ex.: 5 tentativas/minuto por IP)
- Texto de apoio: "Use o mesmo usuário e senha do sistema de chamados"

### 5.2 Tela inicial / abrir chamado (`/`)
- Saudação com o nome do usuário logado
- **Catálogo visual**: cards grandes com ícone + rótulo para os problemas mais comuns. Lista inicial (mapear cada card para uma categoria ITIL do GLPI via arquivo de configuração `config/categorias.ts`, editável sem mexer no resto do código):
  - Computador / Não liga ou está lento
  - Impressora / Não imprime
  - Internet / Sem conexão
  - Sistema (E-sus, sistemas da prefeitura)
  - E-mail
  - Telefone / Ramal
  - Outro problema
- Ao clicar num card, abre o formulário com a categoria pré-selecionada:
  - **O que está acontecendo?** (título — obrigatório, curto)
  - **Descreva o problema** (textarea — obrigatório, com dica: "onde você está, desde quando acontece, mensagem de erro se houver")
  - **Urgência** (3 opções amigáveis: "Posso esperar" / "Está atrapalhando o trabalho" / "Parou tudo, é urgente" → mapear para urgency do GLPI: baixa/média/alta)
  - **Anexar foto/print** (opcional, aceitar imagem e PDF, limite 10 MB)
- Ao enviar: criar o ticket via API, mostrar tela de sucesso com o **número do chamado** e botão "Acompanhar meus chamados"

### 5.3 Meus chamados (`/chamados`)
- Lista dos chamados do usuário: número, título, data, status com badge colorida (Novo, Em atendimento, Pendente, Solucionado, Fechado)
- Filtro simples: Abertos / Todos
- Clique abre o detalhe (`/chamados/[id]`): descrição, timeline de acompanhamentos, e campo para **adicionar comentário/resposta** (followup)
- Se o chamado estiver "Solucionado": botões "Aprovar solução" / "Ainda não resolveu" (se a v2 expor a aprovação de solução; senão, apenas orientar a responder com um comentário)

### 5.4 Geral
- Botão sair (encerra a sessão do portal)
- 100% em **português (pt-BR)**
- **Mobile-first**: boa parte dos usuários abrirá pelo celular
- Acessível: bom contraste, fontes legíveis, botões grandes
- Identidade visual: limpa e institucional; cabeçalho "<nome da instituição> — Suporte de TI" (ver PORTAL_INSTITUICAO no .env). Deixar cores em variáveis do Tailwind para ajuste fácil

### Fora do escopo (não implementar)
- Painel do técnico (técnicos continuam usando o GLPI)
- Cadastro/gestão de usuários (feito no GLPI)
- Notificações por e-mail (o GLPI já faz)
- Relatórios/dashboards

---

## 6. Segurança

- HTTPS obrigatório em produção (TLS terminado no nginx-proxy, VM 203)
- Senha do usuário: usada apenas na chamada de token, nunca logada, nunca persistida
- `client_secret` e demais segredos apenas em `.env` no servidor (nunca commitados — incluir `.env` no `.gitignore` e fornecer `.env.example`)
- Cookies: httpOnly + Secure + SameSite=Lax; sessão expira em 8 horas ou junto com o token
- Sanitizar o conteúdo enviado (o GLPI renderiza HTML na descrição — escapar entrada do usuário)
- Validar tipo e tamanho de anexos no servidor
- Headers de segurança básicos (CSP simples, X-Frame-Options DENY)
- Logs sem dados sensíveis (nunca logar senha/token)

---

## 7. Estrutura sugerida do projeto

```
Chamdos-Ti-GLPI/
├── Docs/                        # esta especificação
├── src/
│   ├── app/
│   │   ├── login/
│   │   ├── chamados/
│   │   │   └── [id]/
│   │   ├── api/                 # route handlers (login, tickets, upload)
│   │   └── page.tsx             # abrir chamado
│   ├── lib/
│   │   ├── glpi.ts              # cliente da API do GLPI (token, tickets, followups)
│   │   └── session.ts           # iron-session helpers
│   └── config/
│       └── categorias.ts        # mapeamento card → itilcategories_id
├── deploy/
│   ├── chamados-ti.service      # unit systemd
│   └── nginx-proxy.conf.example # bloco de config p/ VM 203
├── .env.example
└── README.md                    # como rodar local + como fazer deploy
```

---

## 8. Variáveis de ambiente (`.env.example`)

```
GLPI_URL=http://<IP_DA_VM_GLPI>
GLPI_OAUTH_CLIENT_ID=
GLPI_OAUTH_CLIENT_SECRET=
# opcional, só se a API legada for necessária para anexos:
GLPI_LEGACY_APP_TOKEN=
SESSION_SECRET=<string aleatória de 32+ chars>
PORT=3000
```

---

## 9. Deploy no CT 410

O README deve documentar e o repositório deve conter um script `deploy/deploy.sh` (ou tarefa npm) que:

1. Faz build local (`next build`, output standalone)
2. Copia via `scp`/`rsync` para `/opt/chamados-ti` no CT
3. Reinicia o serviço

Setup inicial do CT (documentar no README, executar uma vez):

```bash
# no CT 410 (Ubuntu 24.04)
apt update && apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
mkdir -p /opt/chamados-ti
# criar usuário de serviço sem shell: useradd -r -s /usr/sbin/nologin chamados
```

Unit systemd (`/etc/systemd/system/chamados-ti.service`):

```ini
[Unit]
Description=Portal de Chamados TI (GLPI)
After=network.target

[Service]
User=chamados
WorkingDirectory=/opt/chamados-ti
EnvironmentFile=/opt/chamados-ti/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

No nginx-proxy: server block com TLS apontando `proxy_pass` para a porta 3000 do portal (incluir exemplo em `deploy/nginx-proxy.conf.example`, com `client_max_body_size 12m;` por causa dos anexos).

---

## 10. Critérios de aceite

1. Login `Recepção-PSF1` (ou similar) autentica via portal e o chamado criado aparece no GLPI **com o requerente e a entidade corretos**, sem intervenção manual
2. Chamado criado pelo portal dispara as notificações normais do GLPI e aparece para os técnicos como qualquer outro
3. Usuário vê a lista dos próprios chamados com status atualizado e consegue comentar num chamado em atendimento
4. Anexo de imagem enviado pelo portal aparece no ticket do GLPI
5. Senha incorreta → mensagem amigável; token expirado → volta ao login sem erro feio
6. App consome < 500 MB de RAM em uso normal no CT
7. Interface utilizável num celular de tela pequena

---

## 11. Fases

- **Fase 1 (MVP):** login + abrir chamado (sem anexo) + meus chamados (lista e detalhe)
- **Fase 2:** anexos, adicionar comentário, aprovação de solução
- **Fase 3 (opcional, futuro):** pesquisa de satisfação, base de conhecimento (FAQ dos problemas comuns antes de abrir o chamado)

---

## 12. Referências

- Getting started da API v2: `{GLPI_URL}/api.php/getting-started`
- OpenAPI/Swagger da instância: `{GLPI_URL}/api.php/doc`
- Documentação oficial GLPI — RESTful API (V2): help.glpi-project.org → Configuration → General → API
- API legada (V1, fallback): documentação `apirest.php` no mesmo portal de ajuda

---

## Nota para o Claude Code

Antes de escrever o cliente da API: fazer uma chamada real ao `{GLPI_URL}/api.php/doc` (ou pedir ao desenvolvedor o JSON do OpenAPI) e ajustar os nomes de campos/rotas ao schema real da instância 11.0.6. Não assumir payloads de memória. Em caso de divergência entre esta spec e o OpenAPI do servidor, **o OpenAPI vence**.
