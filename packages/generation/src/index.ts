/**
 * @df/generation — barrel.
 *
 * Orchestration for the generation pipeline stages. Depends on the injected
 * DialogueAIProvider (constraint #9); pure of fs/network. Per Q-A1 the only
 * shipped provider is the mock.
 */
export * from "./profile-generation.js";
export * from "./dialogue-generation.js";
