import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hi from './hi.json';

/**
 * English now; Hindi strings are filled in during week 6 (hi.json). Missing Hindi
 * keys fall back to English, so the app never shows a raw key.
 */
export const defaultNS = 'translation';
export const resources = { en: { translation: en }, hi: { translation: hi } } as const;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: { translation: typeof en };
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Maps a write-path validation field to its translated message. */
export function errorMessage(field: string | undefined): string {
  const known = ['amount', 'newPersonName', 'personId', 'itemNote', 'title', 'hostName', 'eventId', 'name'] as const;
  const key = known.find((k) => k === field);
  return i18n.t(key ? `errors.${key}` : 'errors.generic');
}

export default i18n;
