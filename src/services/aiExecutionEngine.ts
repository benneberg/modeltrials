import {
  ConnectionStatus,
  EncryptedCredential,
  ModelDefinition,
  Participant,
  TrialEvent,
} from '../types/trial';
import { decryptCredential } from './cryptoVault';
import { VaultLockedError } from './vaultSession';

import { fetchWithRetry as fetchWithTimeout, REQUEST_TIMEOUT_MS } from './http';
import { buildProviderRequest } from './providers';
import { consumeStream } from './streaming';

export function buildSystemPromptForParticipant(
  trial: TrialEvent,
  participant: Participant
): string {
  const lines: string[] = [
    `=== MODEL TRIALS EXECUTION PROTOCOL (v0.3.0) ===`,
    `EVENT: ${trial.title}`,
    `CATEGORY: ${trial.category}`,
    `PARTICIPANT IDENTITY: ${participant.pseudonym} (${
      trial.visibilityMode === 'OPEN' ? participant.modelName : 'Anonymized Competitor'
    })`,
    `VISIBILITY MODE: ${trial.visibilityMode}`,
    ``,
    `--- OBJECTIVE ---`,
    trial.objective,
    ``,
    `--- IMMUTABLE RULES ---`,
    trial.rules,
  ];

  if (trial.isRealMoney) {
    lines.push(
      ``,
      `--- REAL-MONEY CAPITAL LEDGER ---`,
      `Starting Capital: $${participant.startingCapitalUsd.toLocaleString('en-US', {
        minimumFractionDigits: 2,
      })} ${trial.currency}`,
      `Current Marked Equity: $${participant.currentEquityUsd.toLocaleString('en-US', {
        minimumFractionDigits: 2,
      })} ${trial.currency}`,
      `Net P&L: ${(
        ((participant.currentEquityUsd - participant.startingCapitalUsd) /
          Math.max(1, participant.startingCapitalUsd)) *
        100
      ).toFixed(2)}%`
    );
  }

  // Visibility Mode Enforcement
  if (trial.visibilityMode === 'ISOLATED') {
    lines.push(
      ``,
      `--- VISIBILITY ENFORCEMENT: ISOLATED ---`,
      `You are operating in strict isolation. You have zero access to other participants' identities, strategies, or scores. Focus solely on maximizing performance against the weighted criteria.`
    );
  } else if (trial.visibilityMode === 'BLIND') {
    const sorted = [...trial.participants].sort(
      (a, b) => b.currentEquityUsd - a.currentEquityUsd
    );
    const anonStandings = sorted
      .map((p, idx) => {
        const isSelf = p.id === participant.id;
        const metric = trial.isRealMoney
          ? `$${p.currentEquityUsd.toLocaleString()} (${(
              ((p.currentEquityUsd - p.startingCapitalUsd) /
                Math.max(1, p.startingCapitalUsd)) *
              100
            ).toFixed(2)}%)`
          : `Composite Score: ${getParticipantAverageScore(p).toFixed(1)}/100`;
        return `  Rank #${idx + 1}: ${isSelf ? '[YOU]' : 'Anonymized Peer'} — ${metric}`;
      })
      .join('\n');

    lines.push(
      ``,
      `--- VISIBILITY ENFORCEMENT: BLIND STANDINGS ---`,
      `Competitor model names and raw submissions are hidden. Anonymized field dispersion:`,
      anonStandings
    );
  } else if (trial.visibilityMode === 'OPEN') {
    const openStandings = trial.participants
      .map((p, idx) => {
        const latestSnap = p.portfolioHistory[p.portfolioHistory.length - 1];
        const tickers = latestSnap
          ? latestSnap.positions.map((pos) => `${pos.ticker} (${pos.allocationPct}%)`).join(', ')
          : 'No holdings logged';
        return `  ${idx + 1}. ${p.pseudonym} [${p.modelName}]: Equity $${p.currentEquityUsd.toLocaleString()} | Holdings: ${tickers}`;
      })
      .join('\n');

    lines.push(
      ``,
      `--- VISIBILITY ENFORCEMENT: OPEN ARENA ---`,
      `All participant identities, standings, and public holdings are visible:`,
      openStandings
    );
  }

  lines.push(
    ``,
    `--- WEIGHTED EVALUATION RUBRIC ---`,
    ...trial.criteria.map(
      (c) => `- ${c.name} (${c.weight}%): ${c.description}`
    )
  );

  return lines.join('\n');
}

export function getParticipantAverageScore(participant: Participant): number {
  const evals = Object.values(participant.evaluations || {});
  if (evals.length === 0) {
    const lastCurve = participant.equityCurve[participant.equityCurve.length - 1];
    return lastCurve?.score || 0;
  }
  const sum = evals.reduce((acc, e) => acc + e.weightedTotal, 0);
  return Number((sum / evals.length).toFixed(2));
}

export async function executeParticipantPrompt(params: {
  trial: TrialEvent;
  participant: Participant;
  modelDef?: ModelDefinition;
  credential?: EncryptedCredential;
  userPrompt: string;
  /** When set, the reply is streamed and this receives the full text so far. */
  onToken?: (textSoFar: string) => void;
}): Promise<{
  content: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  executionMode: 'direct_api' | 'simulated_sandbox' | 'failed';
  warningNotice?: string;
}> {
  const { trial, participant, modelDef, credential, userPrompt } = params;
  const systemPrompt = buildSystemPromptForParticipant(trial, participant);

  // If user has configured a real encrypted credential, attempt direct browser API execution
  if (modelDef && credential && modelDef.provider !== 'manual') {
    try {
      const apiKey = await decryptCredential(credential);
      const history = participant.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const stream = typeof params.onToken === 'function';
      const req = buildProviderRequest(modelDef, apiKey, systemPrompt, history, userPrompt, stream);
      const response = await fetchWithTimeout(req.url, {
        method: 'POST',
        headers: req.headers,
        body: req.body,
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
        throw new Error(`${req.label} HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }

      let text: string;
      let tokensIn: number | undefined;
      let tokensOut: number | undefined;
      if (stream && response.body) {
        ({ text, tokensIn, tokensOut } = await consumeStream(response.body, req.parseStreamEvent, params.onToken));
      } else {
        ({ text, tokensIn, tokensOut } = req.extractJson(await response.json()));
      }
      if (!text.trim()) throw new Error(`${req.label} returned an empty response.`);

      // Providers that omit usage get a length-based estimate, never a made-up constant.
      const inTok = tokensIn ?? Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const outTok = tokensOut ?? Math.ceil(text.length / 4);
      const cost = (inTok / 1000) * modelDef.costPer1kInput + (outTok / 1000) * modelDef.costPer1kOutput;

      return {
        content: text,
        tokensInput: inTok,
        tokensOutput: outTok,
        estimatedCostUsd: Number(cost.toFixed(5)),
        executionMode: 'direct_api',
      };
    } catch (err) {
      const locked = err instanceof VaultLockedError;
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      const reason = locked
        ? err.message
        : aborted
          ? `The request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
          : err instanceof DOMException && err.name === 'OperationError'
            ? 'The vault passphrase could not decrypt this key.'
            : err instanceof Error
              ? err.message
              : 'Network error';
      // A real key is linked, so never substitute a fabricated answer: a benchmark must
      // not record text that no model wrote. Report the failure and let the user retry
      // or paste the answer manually.
      return {
        content: `⚠ No response was generated.\n\n${reason}\n\nIf the browser blocked the call (CORS), run this prompt in the provider's own app and paste the answer in as a manual entry.`,
        tokensInput: 0,
        tokensOutput: 0,
        estimatedCostUsd: 0,
        executionMode: 'failed',
        warningNotice: reason,
      };
    }
  }

  // Default: Context-aware intelligent sandbox response so the user can test every workflow immediately
  await new Promise((r) => setTimeout(r, 520));
  const sandbox = generateContextualModelResponse(trial, participant, userPrompt);
  return {
    ...sandbox,
    content: `[SANDBOX · simulated text, not written by a real model]\n\n${sandbox.content}`,
  };
}

function generateContextualModelResponse(
  trial: TrialEvent,
  participant: Participant,
  userPrompt: string
): {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  executionMode: 'simulated_sandbox';
} {
  const latestSnap =
    participant.portfolioHistory[participant.portfolioHistory.length - 1];
  const pnlPct = trial.isRealMoney
    ? (
        ((participant.currentEquityUsd - participant.startingCapitalUsd) /
          Math.max(1, participant.startingCapitalUsd)) *
        100
      ).toFixed(2)
    : null;

  let content = '';
  if (trial.isRealMoney && latestSnap) {
    const topHolding = latestSnap.positions[0];
    const cashPos = latestSnap.positions.find(
      (p) => p.direction === 'CASH_YIELD' || p.ticker === 'SGOV'
    );
    content = [
      `### ${participant.pseudonym} (${participant.modelName}) — Execution Advisory`,
      ``,
      `**Verified Sleeve NAV:** \`$${participant.currentEquityUsd.toLocaleString('en-US', {
        minimumFractionDigits: 2,
      })}\` (\`${Number(pnlPct) >= 0 ? '+' : ''}${pnlPct}%\` | Sharpe Est: \`${latestSnap.sharpeEstimate}\`)`,
      ``,
      `#### 1. Response to Prompt`,
      `Regarding *"${userPrompt.slice(0, 110)}${userPrompt.length > 110 ? '...' : ''}"*:`,
      `- **Primary Conviction (\`${topHolding?.ticker || 'VST'}\` at \`${topHolding?.allocationPct || 28}%\`)**: Thesis remains intact with entry at \`$${topHolding?.entryPrice}\` vs mark \`$${topHolding?.currentPrice}\`. We maintain our trailing invalidation stop and refuse to breach the \`35.0%\` concentration limit.`,
      `- **Liquidity & Downside Buffer**: Holding \`${cashPos?.allocationPct || 12.0}%\` in \`SGOV\` T-Bills (yielding ~5.18% annualized), satisfying Rule #3 (\`>=10%\` reserve).`,
      ``,
      `#### 2. Actionable Order & Risk Parameter`,
      `- **Action**: Hold current core weights into the upcoming milestone cut-off; trim any position that appreciates above \`33.5%\` NAV intraday.`,
      `- **Max Drawdown Guardrail**: Current max drawdown is \`${latestSnap.maxDrawdownPct}%\`, well inside the trial ceiling.`,
    ].join('\n');
  } else {
    content = [
      `### ${participant.pseudonym} (${participant.modelName}) — Deliverable Synthesis`,
      ``,
      `**Visibility Mode Enforced:** \`${trial.visibilityMode}\` | **Criterion Alignment:** \`${trial.criteria
        .map((c) => `${c.name} (${c.weight}%)`)
        .join(' · ')}\``,
      ``,
      `#### Structured Execution Plan`,
      `1. **Primary Analysis**: Addressing *"${userPrompt.slice(0, 100)}"* under strict trial constraints.`,
      `2. **Falsifiable Deliverable**: Quantified trade-offs, explicit boundary assumptions, and zero-dependency verification steps ready for Milestone submission.`,
      `3. **Self-Audit Score Estimate**: Targeting \`>90/100\` on ${trial.criteria[0]?.name || 'primary rubric'}.`,
    ].join('\n');
  }

  const tokensInput = 840 + Math.floor(userPrompt.length / 3);
  const tokensOutput = Math.floor(content.length / 3.5);
  const cost = Number(((tokensInput * 0.002 + tokensOutput * 0.008) / 1000).toFixed(4));

  return {
    content,
    tokensInput,
    tokensOutput,
    estimatedCostUsd: cost,
    executionMode: 'simulated_sandbox',
  };
}

export async function testModelConnection(
  modelDef: ModelDefinition,
  credential?: EncryptedCredential
): Promise<{
  status: ConnectionStatus;
  message: string;
  latencyMs: number;
}> {
  const start = performance.now();

  if (modelDef.provider === 'manual') {
    return {
      status: 'ready',
      message: 'Manual / Human participant mode is always ready. Prompts trigger workspace reminders.',
      latencyMs: 4,
    };
  }

  if (!credential) {
    return {
      status: 'cors_fallback',
      message:
        'No encrypted API key linked in Vault. Operating in Local Sandbox / Manual Fallback mode (safe for zero-cost testing).',
      latencyMs: Math.round(performance.now() - start + 18),
    };
  }

  try {
    const apiKey = await decryptCredential(credential);
    if (!apiKey || apiKey.length < 6) {
      return {
        status: 'auth_error',
        message: 'Decrypted API key appears empty or malformed.',
        latencyMs: Math.round(performance.now() - start),
      };
    }

    // Attempt lightweight probe to check CORS & auth headers
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    let res: Response;
    if (modelDef.provider === 'anthropic') {
      res = await fetch(modelDef.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: modelDef.modelId,
          max_tokens: 4,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
    } else {
      res = await fetch(modelDef.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelDef.modelId,
          max_tokens: 4,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
    }
    clearTimeout(timeout);
    const latency = Math.round(performance.now() - start);

    if (res.ok) {
      return {
        status: 'ready',
        message: `Direct API verified (${latency}ms). Browser origin accepted by ${modelDef.provider.toUpperCase()}.`,
        latencyMs: latency,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        status: 'auth_error',
        message: `Authentication rejected (HTTP ${res.status}). Verify your API key in the Vault.`,
        latencyMs: latency,
      };
    }

    return {
      status: 'ready',
      message: `Endpoint reachable (HTTP ${res.status} in ${latency}ms). Ready for execution.`,
      latencyMs: latency,
    };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    if (err instanceof VaultLockedError) {
      return { status: 'auth_error', message: err.message, latencyMs: latency };
    }
    if (err instanceof DOMException && err.name === 'OperationError') {
      return {
        status: 'auth_error',
        message: 'The vault passphrase could not decrypt this key.',
        latencyMs: latency,
      };
    }
    return {
      status: 'cors_fallback',
      message:
        'Browser CORS policy or network blocked direct call. Automatic fallback to Sandbox & One-Click Manual Prompt Copy is enabled.',
      latencyMs: latency,
    };
  }
}
