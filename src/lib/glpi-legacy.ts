/**
 * Cliente da API legada do GLPI (apirest.php / api.php/v1) — usado SOMENTE
 * para anexos, conforme previsto na spec §4.3: a API v2 desta versão não
 * permite criar o vínculo documento→chamado (os campos identificadores do
 * Document_Item são somente-leitura no schema).
 *
 * Regra descoberta na validação: o documento precisa ser criado NA MESMA
 * ENTIDADE do chamado, senão o vínculo é negado por permissão.
 *
 * Autenticação: App-Token (cliente de API legado) + user_token da conta de
 * serviço portal-svc. Sessões são iniciadas por operação e encerradas ao fim.
 */

import "server-only";

function glpiBaseUrl(): string {
  const url = process.env.GLPI_URL;
  if (!url) throw new Error("GLPI_URL não definido no .env");
  return url.replace(/\/+$/, "");
}

const V1_PATH = "/api.php/v1";

function legacyConfigured(): boolean {
  return Boolean(process.env.GLPI_LEGACY_APP_TOKEN && process.env.GLPI_LEGACY_USER_TOKEN);
}

async function initSession(): Promise<string | null> {
  if (!legacyConfigured()) return null;
  try {
    const res = await fetch(`${glpiBaseUrl()}${V1_PATH}/initSession`, {
      headers: {
        "App-Token": process.env.GLPI_LEGACY_APP_TOKEN!,
        Authorization: `user_token ${process.env.GLPI_LEGACY_USER_TOKEN}`,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`API legada: initSession falhou (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const data = (await res.json()) as { session_token?: string };
    return data.session_token ?? null;
  } catch (err) {
    console.error("API legada: erro no initSession:", err instanceof Error ? err.message : "erro");
    return null;
  }
}

async function killSession(sessionToken: string): Promise<void> {
  try {
    await fetch(`${glpiBaseUrl()}${V1_PATH}/killSession`, {
      headers: {
        "App-Token": process.env.GLPI_LEGACY_APP_TOKEN!,
        "Session-Token": sessionToken,
      },
      cache: "no-store",
    });
  } catch {
    /* melhor esforço */
  }
}

/**
 * Sobe um arquivo e o vincula ao chamado, criando o documento na entidade do
 * chamado (obrigatório para o vínculo ser aceito). Retorna true em sucesso.
 */
export async function legacyUploadDocumentToTicket(
  ticketId: number,
  ticketEntityId: number,
  file: File,
): Promise<boolean> {
  const sessionToken = await initSession();
  if (!sessionToken) return false;

  const headers = {
    "App-Token": process.env.GLPI_LEGACY_APP_TOKEN!,
    "Session-Token": sessionToken,
  };

  try {
    // 1) upload do documento na entidade do chamado
    const manifest = JSON.stringify({
      input: {
        name: file.name,
        entities_id: ticketEntityId,
        is_recursive: 0,
        _filename: [file.name],
      },
    });
    const form = new FormData();
    form.append("uploadManifest", manifest);
    form.append("filename[0]", file, file.name);

    const upload = await fetch(`${glpiBaseUrl()}${V1_PATH}/Document`, {
      method: "POST",
      headers,
      body: form,
      cache: "no-store",
    });
    if (!upload.ok) {
      console.error(
        `API legada: upload de "${file.name}" falhou (HTTP ${upload.status}): ${(await upload.text()).slice(0, 300)}`,
      );
      return false;
    }
    const uploaded = (await upload.json()) as { id?: number };
    if (typeof uploaded.id !== "number") {
      console.error("API legada: upload sem id de documento na resposta");
      return false;
    }

    // 2) vínculo documento → chamado
    const link = await fetch(`${glpiBaseUrl()}${V1_PATH}/Document_Item`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { documents_id: uploaded.id, itemtype: "Ticket", items_id: ticketId },
      }),
      cache: "no-store",
    });
    if (!link.ok) {
      console.error(
        `API legada: vínculo do doc ${uploaded.id} ao chamado ${ticketId} falhou (HTTP ${link.status}): ${(await link.text()).slice(0, 300)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `API legada: erro ao anexar "${file.name}":`,
      err instanceof Error ? err.message : "erro desconhecido",
    );
    return false;
  } finally {
    void killSession(sessionToken);
  }
}
