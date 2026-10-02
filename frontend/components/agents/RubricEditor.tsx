"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { CriterionFormData, HardRuleFormData } from "@/lib/types";

interface RubricEditorProps {
  criteria: CriterionFormData[];
  hardRules: HardRuleFormData[];
  onChange: (criteria: CriterionFormData[], hardRules: HardRuleFormData[]) => void;
}

// Radix Select items can't have an empty-string value, so "no criterion selected" is
// represented with this sentinel and mapped back to "" when stored.
const NO_CRITERION = "__none__";

const HARD_RULE_TYPE_HINTS: Record<string, string> = {
  any_below:
    "Fails the call if ANY criterion scores below the threshold, even if the overall weighted score would otherwise pass.",
  criterion_below:
    "Fails the call if the selected criterion specifically scores below the threshold.",
  not_assessable_fail:
    "Fails the call if the selected criterion (or any criterion, if none is selected) came back NOT_ASSESSABLE.",
  failure_tag_any:
    "Not score-based — fails on a specific observed behavior instead. Use this for rules like \"inventing a feature is an automatic fail\".",
};

export function RubricEditor({ criteria, hardRules, onChange }: RubricEditorProps) {
  const addCriterion = () => {
    onChange(
      [...criteria, { name: "", weight: 1.0, description: "", goodLooksLike: "", badLooksLike: "" }],
      hardRules
    );
  };

  const updateCriterion = (index: number, field: keyof CriterionFormData, value: string | number) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated, hardRules);
  };

  const removeCriterion = (index: number) => {
    onChange(criteria.filter((_, i) => i !== index), hardRules);
  };

  const addHardRule = () => {
    onChange(criteria, [
      ...hardRules,
      { type: "any_below" as const, criterionId: "", threshold: 2, tags: [], description: "" },
    ]);
  };

  const updateHardRule = (index: number, field: keyof HardRuleFormData, value: unknown) => {
    const updated = [...hardRules];
    updated[index] = { ...updated[index], [field]: value };
    onChange(criteria, updated);
  };

  const removeHardRule = (index: number) => {
    onChange(criteria, hardRules.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <Tabs defaultValue="criteria">
        <TabsList>
          <TabsTrigger value="criteria">Criteria ({criteria.length})</TabsTrigger>
          <TabsTrigger value="rules">Hard Rules ({hardRules.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="criteria" className="space-y-4">
          {criteria.map((criterion, idx) => (
            <div key={idx} className="border border-ink-100/70 rounded-[2px_4px_3px_5px] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-300 font-sketch">Criterion {idx + 1}</span>
                <button
                  onClick={() => removeCriterion(idx)}
                  className="text-xs text-destructive hover:underline"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-[1fr_80px] gap-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g., Greeting Quality"
                    value={criterion.name}
                    onChange={(e) => updateCriterion(idx, "name", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Weight</Label>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={criterion.weight}
                    onChange={(e) => updateCriterion(idx, "weight", parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  className="min-h-[60px]"
                  placeholder="What this criterion evaluates…"
                  value={criterion.description}
                  onChange={(e) => updateCriterion(idx, "description", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Good looks like</Label>
                  <Textarea
                    className="min-h-[48px] text-xs"
                    placeholder="Example of good performance…"
                    value={criterion.goodLooksLike}
                    onChange={(e) => updateCriterion(idx, "goodLooksLike", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Bad looks like</Label>
                  <Textarea
                    className="min-h-[48px] text-xs"
                    placeholder="Example of poor performance…"
                    value={criterion.badLooksLike}
                    onChange={(e) => updateCriterion(idx, "badLooksLike", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <Button type="button" variant="secondary" onClick={addCriterion} className="w-full">
            + Add Criterion
          </Button>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <p className="text-xs text-ink-300 mb-2">
            Hard rules trigger automatic FAIL regardless of the overall score.
          </p>

          {hardRules.map((rule, idx) => (
            <div key={idx} className="border border-ink-100/70 rounded-[2px_4px_3px_5px] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-300 font-sketch">Rule {idx + 1}</span>
                <button
                  onClick={() => removeHardRule(idx)}
                  className="text-xs text-destructive hover:underline"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select
                    value={rule.type}
                    onValueChange={(value) => updateHardRule(idx, "type", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any_below">Any criterion below threshold</SelectItem>
                      <SelectItem value="criterion_below">Specific criterion below threshold</SelectItem>
                      <SelectItem value="not_assessable_fail">NOT_ASSESSABLE triggers fail</SelectItem>
                      <SelectItem value="failure_tag_any">Specific behavior tag observed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {rule.type !== "not_assessable_fail" && rule.type !== "failure_tag_any" && (
                  <div>
                    <Label>Threshold</Label>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={rule.threshold ?? 2}
                      onChange={(e) => updateHardRule(idx, "threshold", parseInt(e.target.value) || 2)}
                    />
                  </div>
                )}
              </div>
              <p className="text-[10px] text-ink-300">{HARD_RULE_TYPE_HINTS[rule.type]}</p>

              {(rule.type === "criterion_below" || rule.type === "not_assessable_fail") && (
                <div>
                  <Label>Target Criterion</Label>
                  {criteria.length > 0 ? (
                    <Select
                      value={rule.criterionId || NO_CRITERION}
                      onValueChange={(value) =>
                        updateHardRule(idx, "criterionId", value === NO_CRITERION ? "" : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CRITERION}>
                          Select criterion (or apply to all for not_assessable)
                        </SelectItem>
                        {criteria.map((c, cIdx) => (
                          <SelectItem key={c.id || cIdx} value={c.name || `Criterion ${cIdx + 1}`}>
                            {c.name || `Criterion ${cIdx + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="Criterion Name"
                      value={rule.criterionId || ""}
                      onChange={(e) => updateHardRule(idx, "criterionId", e.target.value)}
                    />
                  )}
                </div>
              )}

              {rule.type === "failure_tag_any" && (
                <div>
                  <Label>Trigger tags (comma-separated)</Label>
                  <Input
                    placeholder="e.g. invented_feature, guaranteed_result, unauthorized_discount"
                    value={(rule.tags ?? []).join(", ")}
                    onChange={(e) =>
                      updateHardRule(
                        idx,
                        "tags",
                        e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
                      )
                    }
                  />
                  <p className="text-[10px] text-ink-300 mt-1">
                    The evaluator is told to use these exact tags when it observes the described behavior — the call fails automatically if any criterion is flagged with one of them.
                  </p>
                </div>
              )}

              <div>
                <Label>Description</Label>
                <Input
                  placeholder="What this rule enforces…"
                  value={rule.description}
                  onChange={(e) => updateHardRule(idx, "description", e.target.value)}
                />
              </div>
            </div>
          ))}

          <Button type="button" variant="secondary" onClick={addHardRule} className="w-full">
            + Add Hard Rule
          </Button>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
