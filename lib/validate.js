/** Schémas de validation (zod). Toute entrée utilisateur passe par parse(). */
import { z } from 'zod';
import { HttpError } from './http.js';

export const PASSWORD_MIN = 10;
export const PIPELINE_STATUSES = ['todo', 'applied', 'interview', 'offer', 'rejected'];
export const CONTRACTS = ['CDI', 'CDD', 'Interim', 'Alternance', 'Stage'];

const str = (max) => z.string().trim().max(max);
const httpUrl = z.string().trim().max(1000).refine(u => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } }, 'URL invalide');

export const email = z.string().trim().toLowerCase().max(254).pipe(z.email({ message: 'Adresse email invalide.' }));
export const password = z.string().min(PASSWORD_MIN, `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`).max(128, 'Mot de passe trop long (128 caractères maximum).');

export const registerSchema = z.object({
  email,
  password,
  prenom: str(60).optional().default(''),
  consent: z.literal(true, { message: 'Vous devez accepter la politique de confidentialité.' }),
});
export const loginSchema = z.object({ email, password: z.string().min(1, 'Mot de passe requis.').max(128) });
export const deleteSchema = z.object({ password: z.string().min(1, 'Confirmez avec votre mot de passe.').max(128) });

export const jobId = z.string().trim().min(3).max(80).regex(/^(ft|adz|lba)_[A-Za-z0-9._-]+$/, 'Identifiant d’offre invalide.');
export const jobSnapshot = z.object({
  title: str(200).optional().default(''),
  company: str(160).optional().default(''),
  city: str(160).optional().default(''),
  contract: str(40).optional().default(''),
  salary: str(80).optional().default(''),
  source: str(40).optional().default(''),
  sourceSite: str(80).optional().default(''),
  posted: str(40).optional().default(''),
  url: httpUrl.optional().or(z.literal('')).default(''),
}).strip().default({});

export const favoriteSchema = z.object({ jobId, job: jobSnapshot });
export const pipelineSchema = z.object({
  jobId,
  status: z.enum(PIPELINE_STATUSES),
  position: z.number().int().min(0).max(10000).optional().default(0),
  notes: str(2000).optional().default(''),
  job: jobSnapshot,
});

const alertQuery = z.object({
  kw: str(120).optional().default(''),
  city: str(80).optional().default(''),
  contrat: z.enum(CONTRACTS).optional().or(z.literal('')).default(''),
  temps: z.enum(['plein', 'partiel']).optional().or(z.literal('')).default(''),
  experience: z.enum(['debutant', '1', '2', '3']).optional().or(z.literal('')).default(''),
  salaireMin: z.coerce.number().int().min(0).max(300000).optional().default(0),
}).strip().refine(q => q.kw || q.city, 'Indiquez au moins un mot-clé ou un lieu.');

const e164 = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Numéro au format international, ex. +33612345678.');
export const alertSchema = z.object({
  label: str(120).optional().default(''),
  query: alertQuery,
  channels: z.array(z.enum(['email', 'whatsapp'])).max(2).optional().default([]).transform(a => [...new Set(a)]),
  whatsappTo: e164.optional().or(z.literal('')).default(''),
  active: z.boolean().optional().default(true),
}).refine(a => !a.channels.includes('whatsapp') || a.whatsappTo, { message: 'Numéro WhatsApp requis pour ce canal.', path: ['whatsappTo'] });
export const alertPatchSchema = z.object({
  label: str(120).optional(),
  channels: z.array(z.enum(['email', 'whatsapp'])).max(2).optional().transform(a => (a ? [...new Set(a)] : a)),
  whatsappTo: e164.optional().or(z.literal('')),
  active: z.boolean().optional(),
});

export const profileSchema = z.object({
  prenom: str(60).optional().default(''),
  nom: str(60).optional().default(''),
  title: str(120).optional().default(''),
  city: str(80).optional().default(''),
  skills: str(1000).optional().default(''),
  contract: str(40).optional().default(''),
}).strip();

export const syncSchema = z.object({
  favorites: z.array(favoriteSchema).max(500).optional().default([]),
  pipeline: z.array(pipelineSchema).max(500).optional().default([]),
  alerts: z.array(alertSchema).max(20).optional().default([]),
  profile: profileSchema.optional(),
});

export const lettreSchema = z.object({
  poste: str(160).min(2, 'Indiquez le poste visé.'),
  entreprise: str(160).optional().default(''),
  atouts: str(1500).optional().default(''),
  profile: z.object({ prenom: str(60).optional().default(''), nom: str(60).optional().default(''), title: str(120).optional().default(''), city: str(80).optional().default(''), skills: str(1000).optional().default('') }).strip().optional().default({}),
  offre: z.object({ title: str(200).optional().default(''), company: str(160).optional().default(''), desc: str(4000).optional().default('') }).strip().optional(),
});

export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (r.success) return r.data;
  const fields = {};
  for (const i of r.error.issues) { const k = i.path.join('.') || '_'; if (!fields[k]) fields[k] = i.message; }
  const first = Object.values(fields)[0] || 'Données invalides.';
  throw new HttpError(400, first, 'validation_error', { fields });
}
