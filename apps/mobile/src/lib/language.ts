import type { ApiUser, Language } from '@shagun/shared';
import { getDb } from '@/db/client';
import { getPreferences, markLanguageSaved, setLanguagePreference } from '@/db/ledger';
import i18n from '@/i18n';
import { useSession } from '@/store/session';
import { api } from './api';

/** Each language's name in its own script, so it can be found from either one. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', hi: 'हिंदी' };

/** Startup: show the language chosen on this phone before the first screen draws. */
export async function restoreLanguage() {
  const { language } = getPreferences(getDb());
  if (language && language !== i18n.language) await i18n.changeLanguage(language);
}

/** Switches the app at once and remembers it on this phone; the account hears when online. */
export async function chooseLanguage(language: Language) {
  setLanguagePreference(getDb(), language, true);
  await i18n.changeLanguage(language);
  void saveLanguageToAccount();
}

/** Saves a language chosen on this phone to the account. Offline, it waits for the next account sync. */
async function saveLanguageToAccount() {
  const { language, languagePending } = getPreferences(getDb());
  if (!language || !languagePending || !useSession.getState().user) return;
  try {
    await api<{ user: ApiUser }>('/me', { method: 'PATCH', body: { language } });
    markLanguageSaved(getDb(), language);
  } catch {
    // tried again by syncAccount
  }
}

/**
 * After /me: a choice made on this phone goes up to the account; otherwise the
 * account's language (chosen on another phone, or at sign-in) comes down.
 */
export async function reconcileLanguage(account: Language) {
  const { language, languagePending } = getPreferences(getDb());
  if (languagePending) return saveLanguageToAccount();
  if (language === account) return;
  setLanguagePreference(getDb(), account, false);
  await i18n.changeLanguage(account);
}
