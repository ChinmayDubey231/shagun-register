import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { colors, fonts, radius, space } from '@/theme';
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
          // Android's default padding grows a one-line field past 52, out of line with the date button beside it.
          rest.multiline ? null : { paddingVertical: 0 },
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
  // Same label gap as the forms' chip and date groups, so fields side by side line up.
  wrap: { gap: space.sm },
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
