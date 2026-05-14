// Voice & Natural Interface exports
export {
  VoiceEngine,
  voiceEngine,
  type VoiceConfig,
  type VoiceCommand,
  type TTSOptions,
} from './voiceEngine.js';

export {
  registerCommand,
  getAllCommands,
  getCommandsByCategory,
  findCommand,
  executeCommand,
  getHelpText,
  commandRegistry,
  type CommandDefinition,
  type CommandParams,
  type CommandResult,
  type ConversationContext,
} from './commandRegistry.js';

export {
  ConversationContextManager,
  conversationContext,
  type ConversationSession,
  type ConversationTurn,
  type UserPreferences,
  type ContextHint,
} from './conversationContext.js';

export {
  HederaVoiceHandler,
  hederaVoiceHandler,
  type HederaCommand,
  type HederaCommandResult,
} from './hederaVoiceHandler.js';
