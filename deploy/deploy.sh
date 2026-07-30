#!/usr/bin/env bash
#
# Deploy do portal para o servidor de destino.
# Rodar da raiz do projeto (no Windows: Git Bash ou WSL).
#
#   ./deploy/deploy.sh usuario@host
#   DEPLOY_HOST=usuario@host ./deploy/deploy.sh
#
# Pré-requisitos no CT (uma vez só — ver README):
#   - Node.js 22, usuário "chamados", /opt/chamados-ti criado
#   - /opt/chamados-ti/.env preenchido (o deploy NÃO envia o .env)
#   - systemd unit chamados-ti instalada e habilitada

set -euo pipefail

HOST="${1:-${DEPLOY_HOST:-}}"
DEST="${DEPLOY_DEST:-/opt/chamados-ti}"

if [ -z "${HOST}" ]; then
  echo "Informe o destino: ./deploy/deploy.sh usuario@host (ou defina DEPLOY_HOST)" >&2
  exit 1
fi

echo "==> Build (standalone)..."
npm run build

# O build standalone gera .next/standalone com server.js e node_modules mínimos;
# os assets estáticos e a pasta public precisam ser copiados para dentro dele.
echo "==> Montando pacote..."
rm -rf .deploy-pkg
mkdir -p .deploy-pkg
cp -r .next/standalone/. .deploy-pkg/
mkdir -p .deploy-pkg/.next/static
cp -r .next/static/. .deploy-pkg/.next/static/
if [ -d public ]; then
  mkdir -p .deploy-pkg/public
  cp -r public/. .deploy-pkg/public/
fi

echo "==> Enviando para ${HOST}:${DEST} ..."
rsync -az --delete \
  --exclude '.env' \
  .deploy-pkg/ "${HOST}:${DEST}/"

echo "==> Ajustando permissões e reiniciando o serviço..."
ssh "${HOST}" "chown -R chamados:chamados ${DEST} && systemctl restart chamados-ti && systemctl --no-pager --lines=5 status chamados-ti"

rm -rf .deploy-pkg
echo "==> Deploy concluído."
