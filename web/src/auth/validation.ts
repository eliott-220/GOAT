export const MIN_PASSWORD_LENGTH = 8

/** Contrôle volontairement léger (le serveur a le dernier mot) : quelque chose@domaine.tld. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

/** Renvoie le problème à afficher, ou undefined si le mot de passe convient. */
export function passwordProblem(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) return `Mot de passe trop court : ${MIN_PASSWORD_LENGTH} caractères minimum.`
  return undefined
}

/** Étape « Compte » de l'inscription (email, mot de passe, confirmation) : le problème à afficher, ou undefined si tout est bon. */
export function accountStepProblem(email: string, password: string, confirm: string): string | undefined {
  if (!isValidEmail(email)) return "Cette adresse email n'a pas l'air valide."
  const problem = passwordProblem(password)
  if (problem) return problem
  if (password !== confirm) return 'Les deux mots de passe sont différents.'
  return undefined
}
