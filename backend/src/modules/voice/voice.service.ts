import { config } from "../../config";
import { AgentService } from "../agents/agent.service";
import type { Agent, Criterion, HardRule } from "@prisma/client";

const agentService = new AgentService();

type AgentWithConfig = Agent & { criteria: Criterion[]; hardRules: HardRule[] };

export class VoiceService {
  /**
   * Builds a Vapi inline assistant config from an AgentConfig, so the same configuration
   * that drives evaluation also drives the live voice behavior (CLAUDE.md §4). The Web
   * SDK runs entirely in the browser with this config plus a public key — no phone
   * number, no Twilio, no backend Vapi credential needed.
   */
  async getAssistantConfig(agentId: string) {
    const agent = (await agentService.getById(agentId)) as AgentWithConfig;

    const systemPromptParts = [
      agent.persona ? `Persona: ${agent.persona}` : null,
      agent.goal ? `Goal: ${agent.goal}` : null,
      agent.guidelines.length > 0
        ? `Guidelines:\n${agent.guidelines.map((g, i) => `${i + 1}. ${g}`).join("\n")}`
        : null,
      agent.knowledge.length > 0
        ? `Knowledge & policies:\n${agent.knowledge.map((k) => `- ${k}`).join("\n")}`
        : null,
      // Voice models default to English unless told otherwise explicitly — naming the
      // agent's configured language(s) isn't enough on its own; it needs to be a direct
      // behavioral instruction, or the model keeps answering in English regardless.
      agent.language
        ? `Language: you are fully fluent in ${agent.language}. The instant the caller speaks in a different language than you're currently using, switch to match them on your very next turn — never ask permission to switch, never stay in one language out of habit.`
        : null,
    ].filter(Boolean);

    return {
      name: agent.name.slice(0, 40),
      firstMessage: agent.openingLine || undefined,
      model: {
        provider: config.vapi.modelProvider,
        model: config.vapi.modelName,
        messages: [
          {
            role: "system" as const,
            content: systemPromptParts.join("\n\n") || `You are ${agent.name}.`,
          },
        ],
      },
      voice: {
        provider: config.vapi.voiceProvider,
        voiceId: config.vapi.voiceId,
        ...(config.vapi.voiceProvider === "vapi"
          ? { version: config.vapi.voiceVersion, language: config.vapi.voiceLanguage }
          : {}),
      },
      transcriber: {
        provider: config.vapi.transcriberProvider,
        model: config.vapi.transcriberModel,
        language: config.vapi.transcriberLanguage,
      },
    };
  }
}
