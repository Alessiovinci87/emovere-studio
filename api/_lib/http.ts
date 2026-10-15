// Risposte JSON delle funzioni. I messaggi di errore sono in italiano: l'app li mostra così come sono.

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, status)
}

/** Errore con un messaggio già adatto all'utente */
export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

/** Esegue l'handler e trasforma gli errori in risposte leggibili. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run()
  } catch (err) {
    if (err instanceof UserError) return fail(err.message, err.status)
    console.error(err)
    return fail('Qualcosa non ha funzionato sul server. Riprova tra poco.', 500)
  }
}
