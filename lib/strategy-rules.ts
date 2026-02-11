/**
 * Strategy rules format:
 * - Legacy: plain string (single block of text)
 * - New: JSON array [{"id":"...","text":"..."}] for per-rule tracking
 *
 * When passing to AI, we always produce a single formatted string.
 */

export interface StrategyRuleItem {
  id: string;
  text: string;
}

const RULES_JSON_PREFIX = '[';

/** Parse stored rules into structured items. Handles both legacy and new format. */
export function parseRuleItems(rules: string): StrategyRuleItem[] {
  if (!rules?.trim()) return [];

  const trimmed = rules.trim();
  if (trimmed.startsWith(RULES_JSON_PREFIX)) {
    try {
      const parsed = JSON.parse(rules) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((r): r is StrategyRuleItem => r && typeof r.id === 'string' && typeof r.text === 'string')
          .map((r) => ({ id: r.id, text: r.text }));
      }
    } catch {
      /* fall through to legacy */
    }
  }

  // Legacy: treat entire string as one rule
  return [{ id: 'legacy', text: trimmed }];
}

/** Format rules for AI prompt (numbered list). */
export function formatRulesForPrompt(rules: string): string {
  const items = parseRuleItems(rules);
  if (items.length === 0) return rules || '';
  return items.map((r, i) => `${i + 1}. ${r.text.trim()}`).join('\n');
}

/** Serialize rule items to storage format. */
export function serializeRuleItems(items: StrategyRuleItem[]): string {
  return JSON.stringify(items.filter((r) => r.text.trim()));
}
