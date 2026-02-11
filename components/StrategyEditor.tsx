'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseRuleItems, serializeRuleItems, type StrategyRuleItem } from '@/lib/strategy-rules';
import { cn } from '@/lib/utils';

interface StrategyEditorProps {
  strategyId?: string;
}

function generateRuleId() {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function StrategyEditor({ strategyId }: StrategyEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(!!strategyId);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    rules: '',
  });
  const [ruleItems, setRuleItems] = useState<StrategyRuleItem[]>([]);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (strategyId) {
      fetchStrategy();
    } else {
      setRuleItems([{ id: generateRuleId(), text: '' }]);
    }
  }, [strategyId]);

  const fetchStrategy = async () => {
    try {
      const response = await fetch(`/api/strategies/${strategyId}`);
      const data = await response.json();
      if (data.success) {
        setFormData({
          name: data.data.name,
          description: data.data.description || '',
          rules: data.data.rules,
        });
        const items = parseRuleItems(data.data.rules);
        setRuleItems(items.length > 0 ? items : [{ id: generateRuleId(), text: '' }]);
      }
    } catch (error) {
      console.error('Failed to fetch strategy:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setResult(null);
  };

  const updateRule = (id: string, text: string) => {
    setRuleItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, text } : r))
    );
    setResult(null);
  };

  const addRule = () => {
    setRuleItems((prev) => [...prev, { id: generateRuleId(), text: '' }]);
  };

  const removeRule = (id: string) => {
    setRuleItems((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length > 0 ? next : [{ id: generateRuleId(), text: '' }];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setResult(null);

    const rules = serializeRuleItems(ruleItems);

    try {
      const url = strategyId ? `/api/strategies/${strategyId}` : '/api/strategies';
      const method = strategyId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...formData, rules }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: strategyId ? 'Strategy updated successfully' : 'Strategy created successfully',
        });
        setTimeout(() => {
          router.push(strategyId ? `/strategies/${strategyId}` : '/strategies');
        }, 1500);
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to save strategy',
        });
      }
    } catch (error: any) {
      setResult({ success: false, message: error.message || 'Failed to save strategy' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div>Loading strategy...</div>;
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Strategy Name *</Label>
            <Input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="e.g., Copper Breakout Strategy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              type="text"
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Brief description of the strategy"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Strategy Rules *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addRule}>
                Add Rule
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Each rule is a separate input for future performance tracking. Use AI to refine each rule.
            </p>

            <div className="space-y-4">
              {ruleItems.map((rule, index) => (
                <RuleInput
                  key={rule.id}
                  index={index}
                  rule={rule}
                  onUpdate={(text) => updateRule(rule.id, text)}
                  onRemove={() => removeRule(rule.id)}
                  canRemove={ruleItems.length > 1}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={saving || ruleItems.every((r) => !r.text.trim())}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>

          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'}>
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function RuleInput({
  index,
  rule,
  onUpdate,
  onRemove,
  canRemove,
}: {
  index: number;
  rule: StrategyRuleItem;
  onUpdate: (text: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);

  const handleSuggest = async () => {
    if (!rule.text.trim()) return;
    setSuggesting(true);
    setSuggestions(null);
    try {
      const res = await fetch('/api/strategies/suggest-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule: rule.text }),
      });
      const data = await res.json();
      if (data.success && data.data?.suggestions?.length) {
        setSuggestions(data.data.suggestions);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestion = (text: string) => {
    onUpdate(text);
    setSuggestions(null);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">Rule {index + 1}</span>
        <div className="flex gap-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSuggest}
            disabled={suggesting || !rule.text.trim()}
          >
            {suggesting ? 'Getting suggestions...' : 'AI suggest'}
          </Button>
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      <Textarea
        value={rule.text}
        onChange={(e) => onUpdate(e.target.value)}
        placeholder="e.g., Enter long when price closes above the highest swing high of the last 3 candles"
        rows={2}
        className="font-mono text-sm"
      />

      {suggestions && suggestions.length > 0 && (
        <div className="pt-2 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Choose an option to apply:</p>
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applySuggestion(s)}
                className={cn(
                  'text-left p-3 rounded-md border text-sm',
                  'hover:border-primary hover:bg-primary/5 transition-colors'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      </CardContent>
    </Card>
  );
}
