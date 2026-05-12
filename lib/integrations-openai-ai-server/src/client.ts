import OpenAI from "openai";

type OpenAIIntegrationGlobalState = {
  client: OpenAI | null;
  baseURL: string | null;
  apiKeyConfigured: boolean;
  initError: string | null;
};

const globalState = globalThis as typeof globalThis & {
  __restaurantOsOpenAI?: OpenAIIntegrationGlobalState;
};

globalState.__restaurantOsOpenAI ??= {
  client: null,
  baseURL: null,
  apiKeyConfigured: false,
  initError: null,
};

const state = globalState.__restaurantOsOpenAI;

export function getOpenAIIntegrationStatus() {
  return {
    configured: Boolean(
      process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
        process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    ),
    initialized: Boolean(state.client),
    baseURLConfigured: Boolean(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL),
    apiKeyConfigured: Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
    initError: state.initError,
  };
}

export function getOpenAIClient(): OpenAI {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (!baseURL) {
    state.initError = "AI_INTEGRATIONS_OPENAI_BASE_URL is not configured.";
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_BASE_URL must be set before using AI routes.",
    );
  }

  if (!apiKey) {
    state.initError = "AI_INTEGRATIONS_OPENAI_API_KEY is not configured.";
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_API_KEY must be set before using AI routes.",
    );
  }

  if (state.client && state.baseURL === baseURL && state.apiKeyConfigured) {
    return state.client;
  }

  state.client = new OpenAI({
    apiKey,
    baseURL,
  });
  state.baseURL = baseURL;
  state.apiKeyConfigured = true;
  state.initError = null;

  return state.client;
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, property, receiver) {
    const client = getOpenAIClient();
    return Reflect.get(client, property, receiver);
  },
});
