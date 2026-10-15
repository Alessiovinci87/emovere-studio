import { AI_LIMIT_DEFAULT, AI_LIMIT_PERIOD_DEFAULT, type AiLimitPeriod } from '../../src/config/ai.js'
import { UserError } from './http.js'
import { usedInPeriod } from './storage.js'

/** Limite dalle variabili d'ambiente AI_LIMIT e AI_LIMIT_PERIOD (valori non validi → predefiniti). */
export function limitConfig(): { limit: number; period: AiLimitPeriod } {
  const value = Number(process.env.AI_LIMIT)
  const period = process.env.AI_LIMIT_PERIOD?.trim().toLowerCase()
  return {
    limit: Number.isInteger(value) && value > 0 ? value : AI_LIMIT_DEFAULT,
    period: period === 'mese' || period === 'giorno' ? period : AI_LIMIT_PERIOD_DEFAULT,
  }
}

/** Controlla che ci sia posto per `images` immagini; altrimenti errore 429 con un messaggio chiaro. */
export async function checkLimit(images: number, detail = '') {
  const { limit, period } = limitConfig()
  const used = await usedInPeriod(period)
  if (used + images > limit) {
    const [what, restart] = period === 'mese' ? ['mensile', 'il primo del mese'] : ['giornaliero', 'domani']
    throw new UserError(`Limite ${what} raggiunto: ${used} immagini su ${limit}${detail}. Si riparte ${restart}.`, 429)
  }
  return { limit, period, used }
}
