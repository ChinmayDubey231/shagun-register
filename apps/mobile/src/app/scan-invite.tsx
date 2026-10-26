import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NotYet } from '@/components/NotYet';

/** Week 5: camera + ML Kit OCR + confirm screen. */
export default function ScanInviteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <NotYet
      icon="camera"
      body={t('later.scan')}
      action={{ label: t('later.typeInstead'), onPress: () => router.replace('/events/new') }}
    />
  );
}
