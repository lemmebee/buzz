export function classifyProviderError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(msg)) {
    return "Daily request limit reached for the selected AI model. Try again tomorrow, switch the product to a different model (e.g. gemini-flash-lite), or upgrade the API plan.";
  }
  if (/503/.test(msg) && /high demand|overloaded|unavailable/i.test(msg)) {
    return "The AI model is temporarily overloaded. Please try again in a few minutes, or switch the product to a different model.";
  }
  if (/SAFETY|blocked.*safety|safety.*block/i.test(msg)) {
    return "The AI declined to generate this content because of its safety filters. Try adjusting the brief or switching to a different model.";
  }
  if (/API key|API_KEY|invalid.*key|401|403/i.test(msg)) {
    return "The AI provider rejected the API key. Please check the key in settings.";
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed|network/i.test(msg)) {
    return "Network problem reaching the AI provider. Please try again.";
  }
  return "Something went wrong while generating content. Please try again, or switch the product to a different AI model.";
}
