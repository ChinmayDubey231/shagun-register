import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { colors } from '@/theme';
import { syncNow } from './sync';

/** Pull-to-refresh that syncs. Pass the result as a list's `refreshControl`. */
export function useSyncRefresh() {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void syncNow().finally(() => setRefreshing(false));
  }, []);
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sindoor} colors={[colors.sindoor]} />;
}
