import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import type { SettingsStackParamList } from '../navigation/settingsTypes';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';
import RumblyFoundationModels from '../../modules/rumbly-foundation-models/src';

type Props = NativeStackScreenProps<SettingsStackParamList, 'AskRumbly'>;

const DEFAULT_PROMPT = 'Say hello in one short, friendly sentence.';
const DEFAULT_QUERY_PROMPT = "Where's the cheapest hamburger?";

export function AskRumblyScreen({ navigation }: Props) {
  const [availabilityText, setAvailabilityText] = useState('Not checked yet.');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [responseText, setResponseText] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [queryPrompt, setQueryPrompt] = useState(DEFAULT_QUERY_PROMPT);
  const [queryResultText, setQueryResultText] = useState('');
  const [isClassifying, setIsClassifying] = useState(false);
  const [timingPrompt, setTimingPrompt] = useState(DEFAULT_PROMPT);
  const [timingResultText, setTimingResultText] = useState('');
  const [isTiming, setIsTiming] = useState(false);

  const checkAvailability = async () => {
    if (Platform.OS !== 'ios') {
      setAvailabilityText('Foundation Models spike is iOS-only for now.');
      return;
    }
    try {
      const result = await RumblyFoundationModels.checkAvailability();
      setAvailabilityText(JSON.stringify(result));
    } catch (error) {
      setAvailabilityText(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const askPrompt = async () => {
    if (Platform.OS !== 'ios') return;
    setIsAsking(true);
    setResponseText('');
    try {
      const result = await RumblyFoundationModels.askSimplePrompt(prompt);
      setResponseText(result);
    } catch (error) {
      setResponseText(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsAsking(false);
    }
  };

  const classifyQuery = async () => {
    if (Platform.OS !== 'ios') return;
    setIsClassifying(true);
    setQueryResultText('');
    try {
      const result = await RumblyFoundationModels.classifyTestQuery(queryPrompt);
      setQueryResultText(JSON.stringify(result));
    } catch (error) {
      setQueryResultText(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsClassifying(false);
    }
  };

  const askWithTiming = async () => {
    if (Platform.OS !== 'ios') return;
    setIsTiming(true);
    setTimingResultText('');
    try {
      const result = await RumblyFoundationModels.askWithTiming(timingPrompt);
      setTimingResultText(
        `thinking: ${result.thinkingMs}ms, generation: ${result.generationMs}ms, total: ${result.totalMs}ms\n\n${result.content}`
      );
    } catch (error) {
      setTimingResultText(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsTiming(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SettingsScreenHeader title="Ask Rumbly" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content}>
        <Text style={text.bodyMuted}>
          Isolated prototype for natural-language menu and restaurant queries. This screen only
          tests whether the on-device Foundation Models framework is reachable from Expo -- no
          menu/restaurant data is wired up yet.
        </Text>

        <Text style={[styles.sectionLabel, styles.sectionSpacing]}>AVAILABILITY</Text>
        <Pressable
          accessibilityRole="button"
          onPress={checkAvailability}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Check availability</Text>
        </Pressable>
        <Text style={[text.bodyMuted, styles.resultText]}>{availabilityText}</Text>

        <Text style={[styles.sectionLabel, styles.sectionSpacing]}>SIMPLE PROMPT</Text>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          multiline
          style={styles.input}
          placeholder="Ask something..."
        />
        <Pressable
          accessibilityRole="button"
          onPress={askPrompt}
          disabled={isAsking}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isAsking && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{isAsking ? 'Asking...' : 'Ask'}</Text>
        </Pressable>
        {!!responseText && <Text style={[text.bodyMuted, styles.resultText]}>{responseText}</Text>}

        <Text style={[styles.sectionLabel, styles.sectionSpacing]}>STRUCTURED OUTPUT TEST</Text>
        <Text style={[text.bodyMuted, styles.helperText]}>
          Guided Generation test -- extracts queryType (cheapest/nearest) + item from free text.
        </Text>
        <TextInput
          value={queryPrompt}
          onChangeText={setQueryPrompt}
          multiline
          style={styles.input}
          placeholder="Ask a menu question..."
        />
        <Pressable
          accessibilityRole="button"
          onPress={classifyQuery}
          disabled={isClassifying}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isClassifying && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonText}>{isClassifying ? 'Classifying...' : 'Classify'}</Text>
        </Pressable>
        {!!queryResultText && <Text style={[text.bodyMuted, styles.resultText]}>{queryResultText}</Text>}

        <Text style={[styles.sectionLabel, styles.sectionSpacing]}>TIMING BREAKDOWN</Text>
        <Text style={[text.bodyMuted, styles.helperText]}>
          Streams the response to split "thinking" (time to first chunk) from generation time --
          answers whether a streaming UI or just a better loading state is the right fix for the
          ~5s latency.
        </Text>
        <TextInput
          value={timingPrompt}
          onChangeText={setTimingPrompt}
          multiline
          style={styles.input}
          placeholder="Ask something..."
        />
        <Pressable
          accessibilityRole="button"
          onPress={askWithTiming}
          disabled={isTiming}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isTiming && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{isTiming ? 'Timing...' : 'Ask with timing'}</Text>
        </Pressable>
        {!!timingResultText && <Text style={[text.bodyMuted, styles.resultText]}>{timingResultText}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  sectionLabel: {
    fontFamily: FONT_FAMILY.interBold,
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: SPACING.sm,
  },
  sectionSpacing: { marginTop: SPACING.xl },
  helperText: { marginBottom: SPACING.md },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.md,
    backgroundColor: COLORS.forest,
  },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: FONT_FAMILY.interSemiBold,
    fontSize: 15,
    color: COLORS.surface,
  },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 15,
    color: COLORS.ink,
    textAlignVertical: 'top',
  },
  resultText: { marginTop: SPACING.md },
});
