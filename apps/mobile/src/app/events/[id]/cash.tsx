import { useTranslation } from 'react-i18next';
import { NotYet } from '@/components/NotYet';

/** Week 2: enter counted cash, compare with logged cash, list cash entries to check. */
export default function CashReconciliationScreen() {
  const { t } = useTranslation();
  return <NotYet icon="layers" body={t('later.cash')} />;
}
