/**
 * Integrazione con Protocollo.net (account protocollonetweb, PythonAnywhere:
 * /home/protocollonetweb/protocollonet-web).
 *
 * Flusso:
 *  1. connect()  → apre una finestra di login Protocollo.net (via server DocTouché,
 *     che fa da proxy/broker OAuth-like) e ottiene un token di collegamento account.
 *  2. Il token collegato viene salvato in locale (electron-store) e usato per
 *     interrogare /api/protocollonet/ultimo, /api/protocollonet/cerca ecc.
 *  3. L'utente sceglie in quale campo del documento inserire ciascun dato
 *     (numero, data, destinatario, fascicolo, altri campi) tramite mappatura libera.
 */

export async function connectProtocolloNet(syncServerUrl, sessionToken) {
  const res = await fetch(`${syncServerUrl}/api/protocollonet/connect-url`, {
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  if (!res.ok) throw new Error('Impossibile ottenere URL di collegamento a Protocollo.net');
  const { connect_url } = await res.json();

  // Apre la pagina di autorizzazione Protocollo.net in una finestra popup nativa.
  window.open(connect_url, 'protocollonet-connect', 'width=480,height=680');

  return new Promise((resolve) => {
    const handler = (event) => {
      if (event?.data?.type === 'protocollonet:connected') {
        window.removeEventListener('message', handler);
        resolve(event.data.payload);
      }
    };
    window.addEventListener('message', handler);
  });
}

export async function searchProtocolli(syncServerUrl, sessionToken, query) {
  const res = await fetch(`${syncServerUrl}/api/protocollonet/cerca?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  return res.ok ? res.json() : [];
}

/**
 * Mappa i campi di un protocollo selezionato su placeholder testuali nel documento.
 * fieldMapping: { numero: true, data: true, destinatario: false, fascicolo: true, ... }
 * Inserisce nel punto corrente del cursore il valore concatenato secondo la mappatura.
 */
export function buildProtocolInsertText(protocollo, fieldMapping) {
  const parts = [];
  if (fieldMapping.numero) parts.push(`${protocollo.numero_protocollo}/${protocollo.anno}`);
  if (fieldMapping.data) parts.push(new Date(protocollo.data_protocollo).toLocaleDateString('it-IT'));
  if (fieldMapping.destinatario && protocollo.destinatario) parts.push(protocollo.destinatario);
  if (fieldMapping.fascicolo && protocollo.fascicolo) parts.push(protocollo.fascicolo);
  if (fieldMapping.oggetto && protocollo.oggetto) parts.push(protocollo.oggetto);
  return parts.join(' — ');
}
