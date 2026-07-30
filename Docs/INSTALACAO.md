# Instalação passo a passo

Guia linear, do zero até o portal no ar. Cada etapa termina com uma **conferência** — se
ela falhar, o problema está ali, não na etapa seguinte.

Tempo aproximado: **1 a 2 horas** na primeira vez.

**Antes de começar você precisa de:**

- GLPI 11.x funcionando, e acesso de administrador nele
- Um servidor Linux para o portal (Ubuntu 24.04 aqui), que **enxergue o GLPI pela rede**
- Node.js 22

> Rode o portal numa máquina separada do GLPI se puder. Não é obrigatório, mas evita que
> um problema no portal derrube o GLPI junto.

---

## Etapa 1 — Cliente OAuth no GLPI

É assim que cada usuário vai entrar com o próprio login.

1. GLPI → **Configurar → Clientes OAuth → Adicionar**
2. Nome: `Portal de Chamados`
3. Grants: marque **Password**
4. Scopes: marque **api**
5. Salve e copie o **client_id** e o **client_secret**

**Conferência** — troque os valores e rode. Deve voltar um `access_token`:

```bash
curl -s -X POST "https://SEU-GLPI/api.php/token" \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"password","client_id":"SEU_ID","client_secret":"SEU_SECRET",
       "username":"SEU_USUARIO","password":"SUA_SENHA","scope":"api"}'
```

Se vier erro de credencial, revise o passo 3 (o grant **Password** é o que costuma
faltar). Não siga adiante sem esse token — todo o resto depende dele.

---

## Etapa 2 — Conta de serviço

O perfil self-service não pode fazer três coisas que o portal precisa: anexar documento
ao chamado, aprovar solução em nome do requerente e ler a árvore de entidades. Para isso
existe uma conta dedicada.

1. GLPI → **Administração → Usuários → Adicionar**
2. Usuário: `portal-svc` · perfil **Técnico** · entidade **raiz**, recursivo
3. Salve, abra o usuário criado e gere o **Token de API** pessoal (aba de configurações
   do usuário)

---

## Etapa 3 — API legada (só para anexos)

Nesta versão do GLPI a API v2 cria o documento mas **não** o vincula ao chamado. O portal
usa a API antiga só para essa parte.

1. GLPI → **Configurar → Geral → API**
2. Ative a API e crie um **App-Token**

Sem isto tudo funciona, menos anexar arquivo.

---

## Etapa 4 — Baixar e configurar

```bash
git clone https://github.com/romeritodev/portal-chamados-glpi.git
cd portal-chamados-glpi
npm install
cp .env.example .env
```

Edite o `.env`:

```ini
GLPI_URL=http://ip-interno-do-glpi        # sem barra no fim
GLPI_OAUTH_CLIENT_ID=...                  # etapa 1
GLPI_OAUTH_CLIENT_SECRET=...              # etapa 1
GLPI_LEGACY_APP_TOKEN=...                 # etapa 3
GLPI_LEGACY_USER_TOKEN=...                # etapa 2 (token da conta de serviço)
GLPI_SERVICE_USERNAME=portal-svc          # etapa 2
GLPI_SERVICE_PASSWORD=...                 # etapa 2
SESSION_SECRET=...                        # gere abaixo
PORTAL_INSTITUICAO="Prefeitura de Exemplo"
```

Gerar o `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> Use o **endereço interno** do GLPI, não o público. A conversa não precisa sair da rede.

---

## Etapa 5 — Primeiro teste

```bash
npm run dev
```

Abra `http://localhost:3000` e entre com um usuário **comum** do GLPI (não o admin).

**Conferência:** você vê a tela de abertura com os cards e, em "Meus chamados", os
chamados daquela pessoa — e só os dela.

Abra um chamado de teste e confira no GLPI se ele nasceu **na entidade certa**, com o
requerente certo. Se sim, a parte difícil acabou: o resto é acabamento.

---

## Etapa 6 — Ajustar as categorias

Os números em `src/config/categorias.ts` são da instância de origem e **não valem para a
sua**. Duas saídas:

**Rápida:** troque todos os `categoriaId` para `null` e apague os campos `setores`. Os
chamados nascem sem categoria e o técnico classifica no GLPI. Funciona, e dá para ajustar
depois com calma.

**Certa:** liste as suas e substitua os números.

```bash
TOKEN=$(curl -s -X POST "https://SEU-GLPI/api.php/token" -H "Content-Type: application/json" \
  -d '{"grant_type":"password","client_id":"...","client_secret":"...",
       "username":"portal-svc","password":"...","scope":"api"}' | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

curl -s "https://SEU-GLPI/api.php/v2/Dropdowns/ITILCategory?limit=200" -H "Authorization: Bearer $TOKEN"
curl -s "https://SEU-GLPI/api.php/v2/Administration/Entity?limit=200"  -H "Authorization: Bearer $TOKEN"
```

> Vale montar o catálogo lendo os **seus** chamados antigos, não copiando o daqui. Na
> instalação de origem, ler 711 chamados mostrou que "publicar no site" era 15% do volume
> e não tinha categoria nenhuma.

---

## Etapa 7 — Colocar no ar

No servidor:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
useradd -r -s /usr/sbin/nologin chamados
mkdir -p /opt/chamados-ti

nano /opt/chamados-ti/.env        # o mesmo conteúdo da etapa 4
chown chamados:chamados /opt/chamados-ti/.env
chmod 600 /opt/chamados-ti/.env

cp deploy/chamados-ti.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now chamados-ti
```

Na sua máquina, dentro do projeto:

```bash
./deploy/deploy.sh root@SEU-SERVIDOR
```

**Conferência:** `systemctl status chamados-ti` mostra *active (running)*, e
`curl http://localhost:3000/login` no servidor devolve HTTP 200.

---

## Etapa 8 — HTTPS

O portal escuta em HTTP na porta 3000; o TLS fica na frente. Use
[nginx](../deploy/nginx-proxy.conf.example) ou um túnel do Cloudflare.

Com HTTPS na frente, **tire ou deixe `true`** o `SECURE_COOKIES` no `.env` — com `false`
o cookie de sessão trafega sem a marca de seguro.

> `client_max_body_size 12m;` no nginx, senão anexo de 10 MB é recusado pelo proxy antes
> de chegar ao portal.

---

## Opcionais

**Notificação no celular**

```bash
head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40   # PORTAL_CRON_TOKEN no .env
cp deploy/chamados-avisos.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now chamados-avisos.timer
```

**Inteligência artificial** — tela ⚙️ do portal, escolha o serviço e cadastre a chave.
Desligada por padrão; sem chave, o botão nem aparece.

---

## Quando algo não funciona

| Sintoma | Onde olhar |
|---|---|
| Login recusa credencial certa | Grant **Password** no cliente OAuth (etapa 1) |
| Entra, mas não lista chamados | `GLPI_URL` errado, ou o servidor não alcança o GLPI |
| Chamado nasce na entidade errada | O usuário está na entidade errada **no GLPI** |
| Anexo não sobe | Etapa 3, e a conta de serviço precisa de perfil Técnico |
| Tela branca depois do deploy | `journalctl -u chamados-ti -n 50` diz o motivo real |

O log do serviço é quase sempre mais útil que o erro na tela:

```bash
journalctl -u chamados-ti -f
```

Antes de suspeitar do portal, confira o OpenAPI da sua instância em
`https://SEU-GLPI/api.php/doc` — em divergência, **ele vence**, e o ajuste é só em
`src/lib/glpi.ts`. As diferenças que já conhecemos estão em *Armadilhas da API*, no
[README](../README.md).
