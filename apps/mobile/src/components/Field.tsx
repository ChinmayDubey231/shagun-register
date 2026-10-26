import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { colors, fonts, radius } from '@/theme';
import { AppText } from './AppText';

export interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
  optionalLabel?: string;
}

/** Labelled text input. The label is a real accessibility label, not just visual. */
export const Field = forwardRef<TextInputInstance, FieldProps>(function Field(
  { label, hint, error, optionalLabel, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <AppText variant="label" color={colors.inkMuted}>
        {label}
        {optionalLabel ? <AppText variant="meta" color={colors.inkMuted}>{` ${optionalLabel}`}</AppText> : null}
      </AppText>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.placeholder}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          { borderColor: error ? colors.danger : focused ? colors.sindoor : colors.lineStrong },
          focused || error ? { borderWidth: 2 } : null,
          style,
        ]}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color={colors.inkSubtle}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    minHeight: 52,
    borderRadius: radius.input,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 18,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
});
