export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'chatjimmy'

export type ModelChoiceId =
  | 'anthropic-haiku-4.5'
  | 'anthropic-sonnet-5'
  | 'anthropic-opus-5'
  | 'anthropic-fable-5.1'
  | 'openai-luna'
  | 'openai-terra'
  | 'openai-sol'
  | 'openrouter-gemini-3.8-flash'
  | 'openrouter-grok-4.6'
  | 'openrouter-deepseek-v4.1-flash'
  | 'chatjimmy-llama3.1-8b'

export type EffortPref = 'none' | 'low'

export type ModelSpec = {
  id: ModelChoiceId
  provider: ProviderId
  group: 'Anthropic' | 'OpenAI' | 'OpenRouter' | 'ChatJimmy'
  label: string
  apiModel: string
  /** Requested reasoning/thinking depth. `none` when the model allows disabling. */
  effort: EffortPref
  /** Anthropic thinking field. omit = do not send. */
  thinking: 'omit' | 'disabled' | 'always'
  /** Whether non-default temperature is accepted. */
  sampling: boolean
  cacheNote: string
}

export const MODEL_CATALOG: ModelSpec[] = [
  {
    id: 'anthropic-haiku-4.5',
    provider: 'anthropic',
    group: 'Anthropic',
    label: 'Haiku 4.5',
    apiModel: 'claude-haiku-4-5-20251001',
    effort: 'none',
    thinking: 'omit',
    sampling: true,
    cacheNote: 'system 5m + turn 5m',
  },
  {
    id: 'anthropic-sonnet-5',
    provider: 'anthropic',
    group: 'Anthropic',
    label: 'Sonnet 5',
    apiModel: 'claude-sonnet-5',
    effort: 'none',
    thinking: 'disabled',
    sampling: false,
    cacheNote: 'system 5m + turn 5m',
  },
  {
    id: 'anthropic-opus-5',
    provider: 'anthropic',
    group: 'Anthropic',
    label: 'Opus 5',
    apiModel: 'claude-opus-5',
    effort: 'none',
    thinking: 'disabled',
    sampling: false,
    cacheNote: 'system 5m + turn 5m',
  },
  {
    id: 'anthropic-fable-5.1',
    provider: 'anthropic',
    group: 'Anthropic',
    label: 'Fable 5.1',
    apiModel: 'claude-fable-5-1',
    effort: 'low',
    thinking: 'always',
    sampling: false,
    cacheNote: 'system 5m + turn 5m',
  },
  {
    id: 'openai-luna',
    provider: 'openai',
    group: 'OpenAI',
    label: 'GPT-5.6 Luna',
    apiModel: 'gpt-5.6-luna',
    effort: 'none',
    thinking: 'omit',
    sampling: false,
    cacheNote: 'explicit system breakpoint + implicit 30m',
  },
  {
    id: 'openai-terra',
    provider: 'openai',
    group: 'OpenAI',
    label: 'GPT-5.6 Terra',
    apiModel: 'gpt-5.6-terra',
    effort: 'none',
    thinking: 'omit',
    sampling: false,
    cacheNote: 'explicit system breakpoint + implicit 30m',
  },
  {
    id: 'openai-sol',
    provider: 'openai',
    group: 'OpenAI',
    label: 'GPT-5.6 Sol',
    apiModel: 'gpt-5.6-sol',
    effort: 'none',
    thinking: 'omit',
    sampling: false,
    cacheNote: 'explicit system breakpoint + implicit 30m',
  },
  {
    id: 'openrouter-gemini-3.8-flash',
    provider: 'openrouter',
    group: 'OpenRouter',
    label: 'Gemini 3.8 Flash',
    apiModel: 'google/gemini-3.8-flash',
    effort: 'low',
    thinking: 'omit',
    sampling: true,
    cacheNote: 'OpenRouter automatic cache_control',
  },
  {
    id: 'openrouter-grok-4.6',
    provider: 'openrouter',
    group: 'OpenRouter',
    label: 'Grok 4.6',
    apiModel: 'x-ai/grok-4.6',
    effort: 'low',
    thinking: 'omit',
    sampling: true,
    cacheNote: 'OpenRouter automatic cache_control',
  },
  {
    id: 'openrouter-deepseek-v4.1-flash',
    provider: 'openrouter',
    group: 'OpenRouter',
    label: 'DeepSeek V4.1 Flash',
    apiModel: 'deepseek/deepseek-v4.1-flash',
    effort: 'low',
    thinking: 'always',
    sampling: true,
    cacheNote: 'OpenRouter automatic cache_control',
  },
  {
    id: 'chatjimmy-llama3.1-8b',
    provider: 'chatjimmy',
    group: 'ChatJimmy',
    label: 'Llama 3.1 8B',
    apiModel: 'llama3.1-8B',
    effort: 'none',
    thinking: 'omit',
    sampling: true,
    cacheNote: 'none (Taalas backend)',
  },
]

export const DEFAULT_MODEL_ID: ModelChoiceId = 'anthropic-haiku-4.5'

export const MODEL_GROUPS = (['Anthropic', 'OpenAI', 'OpenRouter', 'ChatJimmy'] as const).map((group) => ({
  group,
  models: MODEL_CATALOG.filter((m) => m.group === group),
}))

const byId = new Map(MODEL_CATALOG.map((m) => [m.id, m]))

export function getModel(id: string | null | undefined): ModelSpec {
  return (id && byId.get(id as ModelChoiceId)) || byId.get(DEFAULT_MODEL_ID)!
}

export function isModelChoiceId(id: string): id is ModelChoiceId {
  return byId.has(id as ModelChoiceId)
}

export const ENV_KEY: Record<ProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  chatjimmy: '',
}

export const KEY_STORAGE: Record<ProviderId, string> = {
  anthropic: 'anthropic_api_key',
  openai: 'openai_api_key',
  openrouter: 'openrouter_api_key',
  chatjimmy: '',
}

export const KEY_PLACEHOLDER: Record<ProviderId, string> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  openrouter: 'sk-or-...',
  chatjimmy: '',
}

export const KEY_LABEL: Record<ProviderId, string> = {
  anthropic: 'Anthropic API Key',
  openai: 'OpenAI API Key',
  openrouter: 'OpenRouter API Key',
  chatjimmy: '',
}

export function defaultModelForProvider(provider: ProviderId): ModelSpec {
  return MODEL_CATALOG.find((m) => m.provider === provider) ?? getModel(DEFAULT_MODEL_ID)
}
