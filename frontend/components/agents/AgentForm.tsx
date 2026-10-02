"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { agentApi } from "@/lib/api";
import { RubricEditor } from "./RubricEditor";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { Agent, AgentFormData, CriterionFormData, HardRuleFormData } from "@/lib/types";

interface AgentFormProps {
  agent?: Agent; // If provided, we're editing
}

const defaultForm: AgentFormData = {
  name: "",
  useCase: "",
  persona: "",
  goal: "",
  openingLine: "",
  guidelines: [],
  knowledge: [],
  scoringNotes: [],
  language: "English and Hinglish",
  evaluationTarget: "agent",
  passThreshold: 3.5,
  criteria: [],
  hardRules: [],
};

function ListEditor({
  items,
  onAdd,
  onRemove,
  inputValue,
  onInputChange,
  placeholder,
  addLabel,
  itemClassName,
  multiline,
}: {
  items: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  placeholder: string;
  addLabel: string;
  itemClassName?: string;
  multiline?: boolean;
}) {
  return (
    <>
      <div className="space-y-2 mb-3">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-sm text-ink-500 bg-paper-100 px-3 py-1.5 rounded-sm"
          >
            <span className={`flex-1 ${itemClassName ?? ""}`}>{item}</span>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="text-destructive text-xs hover:underline shrink-0"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {multiline ? (
          <Textarea
            rows={2}
            className="flex-1 text-xs"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
          />
        ) : (
          <Input
            className="flex-1"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd();
              }
            }}
          />
        )}
        <Button type="button" variant="secondary" onClick={onAdd} className={multiline ? "self-end" : ""}>
          {addLabel}
        </Button>
      </div>
    </>
  );
}

export function AgentForm({ agent }: AgentFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guidelineInput, setGuidelineInput] = useState("");
  const [knowledgeInput, setKnowledgeInput] = useState("");
  const [scoringNoteInput, setScoringNoteInput] = useState("");

  const [form, setForm] = useState<AgentFormData>(() => {
    if (!agent) return defaultForm;
    return {
      name: agent.name,
      useCase: agent.useCase || "",
      persona: agent.persona || "",
      goal: agent.goal || "",
      openingLine: agent.openingLine || "",
      guidelines: agent.guidelines,
      knowledge: agent.knowledge,
      scoringNotes: agent.scoringNotes || [],
      language: agent.language,
      evaluationTarget: agent.evaluationTarget || "agent",
      passThreshold: agent.passThreshold,
      criteria: agent.criteria.map((c) => ({
        id: c.id,
        name: c.name,
        weight: c.weight,
        description: c.description,
        goodLooksLike: c.goodLooksLike || "",
        badLooksLike: c.badLooksLike || "",
      })),
      hardRules: agent.hardRules.map((r) => ({
        id: r.id,
        type: r.type,
        criterionId: r.criterionId || "",
        threshold: r.threshold,
        tags: r.tags || [],
        description: r.description || "",
      })),
    };
  });

  const update = (field: keyof AgentFormData, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addGuideline = () => {
    if (!guidelineInput.trim()) return;
    const lines = guidelineInput.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    update("guidelines", [...form.guidelines, ...lines]);
    setGuidelineInput("");
  };

  const removeGuideline = (index: number) => {
    update("guidelines", form.guidelines.filter((_, i) => i !== index));
  };

  const addKnowledge = () => {
    if (!knowledgeInput.trim()) return;
    const lines = knowledgeInput.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    update("knowledge", [...form.knowledge, ...lines]);
    setKnowledgeInput("");
  };

  const removeKnowledge = (index: number) => {
    update("knowledge", form.knowledge.filter((_, i) => i !== index));
  };

  const addScoringNote = () => {
    if (!scoringNoteInput.trim()) return;
    const lines = scoringNoteInput.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    update("scoringNotes", [...form.scoringNotes, ...lines]);
    setScoringNoteInput("");
  };

  const removeScoringNote = (index: number) => {
    update("scoringNotes", form.scoringNotes.filter((_, i) => i !== index));
  };

  const handleRubricChange = (criteria: CriterionFormData[], hardRules: HardRuleFormData[]) => {
    setForm((prev) => ({ ...prev, criteria, hardRules }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!form.name.trim()) {
      setError("Agent name is required");
      setSaving(false);
      return;
    }

    // Filter out completely blank criteria that might have been added inadvertently
    const cleanedCriteria = form.criteria.filter(
      (c) => c.name.trim().length > 0 || c.description.trim().length > 0
    );

    // Validate that if any criteria exist, both name and description are filled
    for (let i = 0; i < cleanedCriteria.length; i++) {
      if (!cleanedCriteria[i].name.trim()) {
        setError(`Criterion #${i + 1} requires a name`);
        setSaving(false);
        return;
      }
      if (!cleanedCriteria[i].description.trim()) {
        setError(`Criterion #${i + 1} ("${cleanedCriteria[i].name}") requires a description`);
        setSaving(false);
        return;
      }
    }

    const payload: AgentFormData = {
      ...form,
      name: form.name.trim(),
      criteria: cleanedCriteria.map((c) => ({
        ...c,
        name: c.name.trim(),
        description: c.description.trim(),
      })),
    };

    try {
      if (agent) {
        await agentApi.update(agent.id, payload);
        router.push(`/agents/${agent.id}`);
      } else {
        const created = await agentApi.create(payload);
        router.push(`/agents/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Card className="border-destructive/30 bg-accent-red-light/30">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {/* Basic info */}
      <Card className="space-y-4">
        <CardHeader className="border-b border-ink-100/50 pb-2 mb-0">
          <CardTitle>Agent Configuration</CardTitle>
        </CardHeader>

        <div>
          <Label>Name *</Label>
          <Input
            required
            placeholder="Agent name (e.g. Nimbus Broadband — Tech Support Line)"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>

        <div>
          <Label>Use Case</Label>
          <Input
            placeholder="e.g. Inbound customer support calls for a home broadband provider"
            value={form.useCase}
            onChange={(e) => update("useCase", e.target.value)}
          />
        </div>

        <div>
          <Label>Persona</Label>
          <Textarea
            className="min-h-[80px]"
            placeholder="Describe the agent's persona and role…"
            value={form.persona}
            onChange={(e) => update("persona", e.target.value)}
          />
          <p className="text-[10px] text-ink-300 mt-1">
            Who the agent is on the call. For roleplay agents (the AI plays a character, not
            itself), put the character's full bio here — including any hidden facts or objections
            it should only reveal if asked. Behavioral instructions ("stay in character", "don't
            agree until earned") fit better under Guidelines below.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Goal</Label>
            <Textarea
              className="min-h-[60px]"
              placeholder="What the agent tries to achieve…"
              value={form.goal}
              onChange={(e) => update("goal", e.target.value)}
            />
          </div>
          <div>
            <Label>Opening Line</Label>
            <Textarea
              className="min-h-[60px]"
              placeholder="How the agent typically opens a call…"
              value={form.openingLine}
              onChange={(e) => update("openingLine", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Language / Dialect</Label>
            <Input
              placeholder="e.g. English and Hinglish"
              value={form.language}
              onChange={(e) => update("language", e.target.value)}
            />
            <p className="text-[10px] text-ink-300 mt-1">
              e.g. Reply in the language the customer uses
            </p>
          </div>
          <div>
            <Label>Evaluation Target</Label>
            <Select
              value={form.evaluationTarget}
              onValueChange={(value) => update("evaluationTarget", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent (score the AI's own turns)</SelectItem>
                <SelectItem value="user">User (score the human caller's turns)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-ink-300 mt-1">
              Which speaker the rubric judges. Use "User" for roleplay/training agents where the
              AI plays a character and a human (trainee) is being assessed.
            </p>
          </div>
          <div>
            <Label>Pass Threshold (1-5)</Label>
            <Input
              type="number"
              min="1"
              max="5"
              step="0.1"
              value={form.passThreshold}
              onChange={(e) => update("passThreshold", parseFloat(e.target.value) || 3.0)}
            />
          </div>
        </div>
      </Card>

      {/* Guidelines */}
      <Card>
        <CardHeader className="border-b border-ink-100/50 pb-2 mb-2">
          <CardTitle>Guidelines</CardTitle>
          <p className="text-xs text-ink-300">
            How the agent should behave (tone, what to do/avoid, when to escalate) — not facts.
          </p>
        </CardHeader>
        <ListEditor
          items={form.guidelines}
          onAdd={addGuideline}
          onRemove={removeGuideline}
          inputValue={guidelineInput}
          onInputChange={setGuidelineInput}
          placeholder="Add a guideline…"
          addLabel="Add"
        />
      </Card>

      {/* Knowledge & Policies */}
      <Card>
        <CardHeader className="border-b border-ink-100/50 pb-2 mb-2">
          <CardTitle>Knowledge & Policies</CardTitle>
          <p className="text-xs text-ink-300">
            Facts the agent must get right — product details, pricing, rules. One bullet per item;
            the agent should never contradict these.
          </p>
        </CardHeader>
        <ListEditor
          items={form.knowledge}
          onAdd={addKnowledge}
          onRemove={removeKnowledge}
          inputValue={knowledgeInput}
          onInputChange={setKnowledgeInput}
          placeholder="Add knowledge or policy rule (e.g. Service credit of at most 3 days for outage > 24 hours. Never promise refunds or discounts)…"
          addLabel="Add Policy"
          multiline
        />
      </Card>

      {/* Rubric */}
      <div>
        <h2 className="text-sm font-medium text-ink-500 mb-3">Evaluation Rubric</h2>
        <RubricEditor
          criteria={form.criteria}
          hardRules={form.hardRules}
          onChange={handleRubricChange}
        />
      </div>

      {/* Rubric Scoring Notes */}
      <Card>
        <CardHeader className="border-b border-ink-100/50 pb-2 mb-2">
          <CardTitle>Rubric Scoring Notes</CardTitle>
          <p className="text-xs text-ink-300">
            Special rules or score caps for the AI evaluator (e.g. conditional rules, score ceilings, or edge cases).
          </p>
        </CardHeader>
        <ListEditor
          items={form.scoringNotes}
          onAdd={addScoringNote}
          onRemove={removeScoringNote}
          inputValue={scoringNoteInput}
          onInputChange={setScoringNoteInput}
          placeholder="Add scoring note (e.g. A customer left without a ticket that guidelines require cannot score above 2 on Customer outcome)..."
          addLabel="Add Note"
          itemClassName="font-mono text-xs before:content-['•_']"
          multiline
        />
      </Card>

      {/* Submit */}
      <div className="flex items-center gap-3 pt-4 border-t border-ink-100">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : agent ? "Update Agent" : "Create Agent"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
