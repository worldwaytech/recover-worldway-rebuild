// Lightweight cookie-consent state shared between the banner and the
// Cookie Policy page. Stored in localStorage; no third-party scripts are
// loaded until the user opts in.

export type ConsentChoice = "accepted" | "rejected";

export const CONSENT_STORAGE_KEY = "ww-cookie-consent";
export const COOKIE_PREFS_EVENT = "ww-open-cookie-preferences";

export function getStoredConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  return value === "accepted" || value === "rejected" ? value : null;
}

export function setStoredConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
}

export function openCookiePreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIE_PREFS_EVENT));
}
