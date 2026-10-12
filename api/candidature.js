/**
 * POST /api/candidature — envoi RÉEL d'une candidature au recruteur, par e-mail (Resend).
 * Uniquement quand :
 *   - APPLY_FROM_EMAIL est défini (expéditeur sur un domaine vérifié dans Resend) ;
 *   - le candidat est connecté ET a confirmé son adresse (elle sert de « Répondre à ») ;
 *   - l'offre France Travail, relue côté serveur, publie une adresse e-mail de candidature
 *     (le destinataire n'est jamais fourni par le navigateur).
 * Le CV transite en mémoire jusqu'à Resend et n'est jamais stocké.
 * Corps : { jobId, name, phone?, letter, cv: { name, type, data(base64) }, consent: true }
 */
import { api, sendJson, readJson, allowMethods, assertSameOrigin, HttpError } from '../lib/http.js';
import { features, env } from '../lib/env.js';
import { requireUser } from '../lib/auth.js';
import { enforce } from '../lib/ratelimit.js';
import { parse, sendApplicationSchema, CV_MAX_BYTES } from '../lib/validate.js';
import { fetchFTById } from '../lib/jobs.js';
import { getApplication, markApplicationSent } from '../lib/userdata.js';
import { sendEmail, renderApplicationEmail } from '../lib/notify.js';

// Adresse seule de APPLY_FROM_EMAIL (« TalentPulse <candidatures@domaine.fr> » → candidatures@domaine.fr)
const fromAddress = () => { const v = env('APPLY_FROM_EMAIL'); const m = v.match(/<([^>]+)>/); return (m ? m[1] : v).trim(); };
const displayName = n => String(n).replace(/["<>\r\n]/g, '').slice(0, 80);

export function decodeCv(cv) {
  const buf = Buffer.from(cv.data, 'base64');
  if (!buf.length) throw new HttpError(400, 'Fichier CV vide.', 'validation_error');
  if (buf.length > CV_MAX_BYTES) throw new HttpError(413, 'CV trop volumineux (3 Mo maximum).', 'payload_too_large');
  if (cv.type === 'application/pdf' && buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(400, 'Le fichier n’est pas un PDF valide.', 'validation_error');
  return buf;
}

export default api(async (req, res) => {
  allowMethods(req, res, ['POST']);
  assertSameOrigin(req);
  if (!features().applyEmail) throw new HttpError(503, 'L’envoi direct au recruteur n’est pas encore activé.', 'feature_disabled');
  const user = await requireUser(req, res);
  if (!user.email_verified_at) throw new HttpError(403, 'Confirmez d’abord votre adresse e-mail (Mon espace) : le recruteur vous répondra dessus.', 'email_unverified');
  const input = parse(sendApplicationSchema, await readJson(req, { maxBody: 4.4 * 1024 * 1024 }));
  const saved = await getApplication(user.id, input.jobId);
  if (!saved) throw new HttpError(409, 'Enregistrez d’abord votre candidature.', 'not_saved');
  if (saved.status === 'sent') throw new HttpError(409, `Candidature déjà envoyée à ${saved.sentTo}.`, 'already_sent');
  const cv = decodeCv(input.cv);
  await enforce([{ key: 'apply-send:' + user.id, limit: 10, windowSec: 86400 }], 'Limite de 10 envois par jour atteinte. Réessayez demain.');

  const offre = await fetchFTById(input.jobId.slice(3)).catch(() => null);
  if (!offre) throw new HttpError(404, 'Offre introuvable ou expirée.', 'not_found');
  if (!offre.applyEmail) throw new HttpError(409, 'Cette offre ne publie pas d’adresse e-mail de candidature.', 'no_apply_email');

  const mail = renderApplicationEmail({ job: { title: offre.title, company: offre.company, ref: input.jobId.slice(3) }, name: input.name, email: user.email, phone: input.phone, letter: input.letter });
  try {
    await sendEmail({
      to: offre.applyEmail,
      from: `"${displayName(input.name)} via TalentPulse" <${fromAddress()}>`,
      replyTo: user.email,
      bcc: user.email, // le candidat reçoit une copie exacte
      ...mail,
      attachments: [{ filename: input.cv.name.replace(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 120), content: cv.toString('base64') }],
    });
  } catch (e) {
    console.error('[candidature] Resend :', e?.message);
    throw new HttpError(502, 'L’envoi a échoué : rien n’a été transmis au recruteur. Réessayez ou envoyez le dossier vous-même.', 'send_failed');
  }
  const application = await markApplicationSent(user.id, input.jobId, offre.applyEmail);
  return sendJson(res, 200, { application, sentTo: offre.applyEmail });
});
