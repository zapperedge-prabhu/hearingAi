import { DefaultAzureCredential } from "@azure/identity";

const SCOPE = "https://cognitiveservices.azure.com/.default";

type Cfg = {
  resourceName: string;
  endpoint?: string | null;
  apiVersion: string;
  apiKey: string | null;
  chatDeployment: string;
};

function extractJsonFromContent(raw: string): any {
  let text = raw.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  // Try direct parse first
  try { return JSON.parse(text); } catch {}

  // Find the outermost JSON object
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }

  // JSON was truncated — close any open arrays/objects to recover partial data
  if (start !== -1) {
    const partial = text.slice(start);
    const fixed = repairTruncatedJson(partial);
    if (fixed) {
      try { return JSON.parse(fixed); } catch {}
    }
  }

  throw new Error(`Invalid JSON from model: ${raw.slice(0, 300)}`);
}

function repairTruncatedJson(partial: string): string | null {
  // Remove any trailing incomplete key/value
  let s = partial.replace(/,\s*$/, "");
  // Also remove trailing incomplete string value like: "feedback": "blah
  s = s.replace(/,?\s*"[^"]*":\s*"[^"]*$/, "");
  // Remove trailing incomplete key
  s = s.replace(/,?\s*"[^"]*$/, "");

  // Count open brackets to close them
  let braces = 0, brackets = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && (i === 0 || s[i - 1] !== "\\")) inString = !inString;
    if (!inString) {
      if (c === "{") braces++;
      else if (c === "}") braces--;
      else if (c === "[") brackets++;
      else if (c === "]") brackets--;
    }
  }

  let closing = "";
  while (brackets > 0) { closing += "]"; brackets--; }
  while (braces > 0) { closing += "}"; braces--; }
  return s + closing;
}

export class FoundryModelsClient {
  private cfg: Cfg;
  private cred = new DefaultAzureCredential();

  constructor(cfg: Cfg) {
    this.cfg = cfg;
  }

  private baseUrl() {
    if (this.cfg.endpoint) {
      const ep = this.cfg.endpoint.replace(/\/+$/, "");
      if ((ep.includes(".services.ai.azure.com") || ep.includes(".cognitiveservices.azure.com")) && !ep.endsWith("/openai")) {
        return `${ep}/openai`;
      }
      return ep;
    }
    return `https://${this.cfg.resourceName}.openai.azure.com/openai`;
  }

  private async headers(): Promise<Record<string, string>> {
    if (this.cfg.apiKey) {
      return { "api-key": this.cfg.apiKey, "Content-Type": "application/json" };
    }
    const token = await this.cred.getToken(SCOPE);
    return { "Authorization": `Bearer ${token.token}`, "Content-Type": "application/json" };
  }

  async gradeJson(prompt: string, questionCount: number = 10): Promise<any> {
    const url = `${this.baseUrl()}/deployments/${this.cfg.chatDeployment}/chat/completions?api-version=${this.cfg.apiVersion}`;
    console.log(`[EvalFoundry] Calling: ${url} | questions=${questionCount}`);
    const body = {
      temperature: 0,
      max_tokens: 16000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return ONLY valid JSON. No markdown. No prose." },
        { role: "user", content: prompt }
      ]
    };

    const res = await fetch(url, { method: "POST", headers: await this.headers(), body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const status = res.status;
      const errCode = json?.error?.code || "";
      const errMsg = json?.error?.message || JSON.stringify(json);
      if (status === 429 || errCode === "RateLimitReached") {
        // Extract retry-after seconds if present in the message
        const retryMatch = errMsg.match(/retry after (\d+) seconds?/i);
        const retryInfo = retryMatch ? ` Please retry after ${retryMatch[1]} seconds.` : " Please retry after a short wait.";
        throw new Error(`Azure OpenAI rate limit reached (429): Too many tokens per minute for your pricing tier.${retryInfo}`);
      }
      if (status === 401 || status === 403) {
        throw new Error(`Azure OpenAI authentication error (${status}): Check your credentials and permissions.`);
      }
      if (status === 404) {
        throw new Error(`Azure OpenAI deployment not found (404): Model deployment "${this.cfg.chatDeployment}" was not found. Check your Foundry resource configuration.`);
      }
      if (status >= 500) {
        throw new Error(`Azure OpenAI service error (${status}): ${errMsg}`);
      }
      throw new Error(`Azure OpenAI error (${status}): ${errMsg}`);
    }

    const choice = json?.choices?.[0];
    const finishReason = choice?.finish_reason;
    const content = choice?.message?.content;
    if (!content) throw new Error("Missing model content");

    if (finishReason === "length") {
      console.warn(`[EvalFoundry] WARNING: Response was cut off (finish_reason=length). Questions=${questionCount}, max_tokens=16000. Attempting JSON repair.`);
    }

    return extractJsonFromContent(content);
  }
}
