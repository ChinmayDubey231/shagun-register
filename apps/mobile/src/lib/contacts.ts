import { matchKey } from '@shagun/shared';
import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { Platform } from 'react-native';

export interface PhoneContact {
  id: string;
  displayName: string;
  nameLatin: string;
  city: null;
  phone: string | null;
}

let cache: PhoneContact[] | null = null;

/** True if contacts permission was already granted (no prompt shown). */
export async function contactsAlreadyAllowed(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Loads names and phone numbers from the phone's contacts. Asks for permission the
 * first time it is called (never at startup), and keeps the list in memory only;
 * nothing from contacts is stored unless the user picks that contact.
 */
export async function loadContacts(): Promise<PhoneContact[] | 'denied'> {
  if (cache) return cache;
  if (Platform.OS === 'web') return 'denied';
  const permission = await requestPermissionsAsync();
  if (!permission.granted) return 'denied';
  const rows = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES]);
  cache = rows
    .filter((r) => r.fullName && r.fullName.trim())
    .map((r) => {
      const name = r.fullName!.trim().replace(/\s+/g, ' ');
      return {
        id: r.id,
        displayName: name,
        nameLatin: matchKey(name),
        city: null,
        phone: r.phones?.[0]?.number?.replace(/[^\d+]/g, '') || null,
      };
    });
  return cache;
}
