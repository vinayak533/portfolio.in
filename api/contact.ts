/**
 * Vercel Function: POST /api/contact. All logic lives in server/contact.ts.
 * Environment variables are set in the Vercel project settings (see README).
 * Other methods are answered with 405 by Vercel itself.
 */
import { handleContact, type ContactEnv } from '../server/contact.js'

const env = () => (globalThis as { process?: { env: ContactEnv } }).process?.env ?? {}

export function POST(request: Request) {
  return handleContact(request, env())
}
