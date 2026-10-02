import { AgentForm } from "@/components/agents/AgentForm";

export default function NewAgentPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-700">New Agent</h1>
        <p className="text-sm text-ink-300 mt-1">
          Configure a new voice agent and its evaluation rubric
        </p>
      </div>
      <AgentForm />
    </div>
  );
}
