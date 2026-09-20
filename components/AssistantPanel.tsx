import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MessageCircle, X, Send, Loader2, Sparkles, AlertTriangle, RotateCcw } from 'lucide-react';
import type { AnalysisReport } from '../types';

interface AssistantPanelProps {
  report: AnalysisReport;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const VERDICT_LABEL: Record<AnalysisReport['verdict'], string> = {
  AUTHENTIC: 'AUTHENTIC',
  SUSPICIOUS: 'SUSPICIOUS',
  LIKELY_FAKE: 'LIKELY_FAKE',
};

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Derives 3 starter questions from the report actually in hand — never generic filler that doesn't match the case. */
function buildStarterQuestions(report: AnalysisReport): string[] {
  const questions: string[] = [`Why was this flagged ${VERDICT_LABEL[report.verdict] ?? report.verdict}?`];

  const failedCheck = report.consistencyChecks?.find((c) => c.status === 'FAIL');
  const topFlag = report.redFlags?.[0];
  const concernModule = report.modules?.find((m) => m.status === 'FAIL' || m.status === 'WARN');

  if (failedCheck) {
    questions.push(`Explain the consistency check that failed: "${failedCheck.check}"`);
  } else if (topFlag) {
    questions.push(`Tell me more about the "${topFlag.title}" finding.`);
  } else if (concernModule) {
    questions.push(`What did the "${concernModule.title}" module find?`);
  } else {
    questions.push('What is the strongest evidence behind this verdict?');
  }

  questions.push('What still needs to be verified at source?');

  return questions.slice(0, 3);
}

async function askAssistant(
  question: string,
  report: AnalysisReport,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, report, history }),
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json?.error || 'The assistant could not answer that. Please try again.');
  }

  return String(json.answer ?? '');
}

const AssistantPanel: React.FC<AssistantPanelProps> = ({ report }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryQuestion, setRetryQuestion] = useState<string | null>(null);

  const prefersReducedMotion = useReducedMotion();
  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const starterQuestions = useMemo(() => buildStarterQuestions(report), [report]);

  useEffect(() => {
    if (open) {
      listEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'end' });
    }
  }, [messages, loading, open, prefersReducedMotion]);

  useEffect(() => {
    if (open) {
      // Focus the input shortly after the panel finishes opening.
      const t = setTimeout(() => inputRef.current?.focus(), prefersReducedMotion ? 0 : 200);
      return () => clearTimeout(t);
    }
  }, [open, prefersReducedMotion]);

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setError(null);
    setRetryQuestion(null);
    setInput('');

    const historyForRequest = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { id: makeId(), role: 'user', content: trimmed }]);
    setLoading(true);

    try {
      const answer = await askAssistant(trimmed, report, historyForRequest);
      setMessages((prev) => [...prev, { id: makeId(), role: 'assistant', content: answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setRetryQuestion(trimmed);
    } finally {
      setLoading(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send(input);
    }
  };

  const panelTransition = { duration: prefersReducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <>
      <AnimatePresence initial={false}>
        {!open && (
          <motion.button
            key="assistant-fab"
            type="button"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.85 }}
            transition={panelTransition}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-14 h-14 rounded-full bg-[#2563EB] hover:bg-[#1E40AF] text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] flex items-center justify-center cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            aria-label="Open DocsGuard Assistant — ask questions about this report"
            aria-expanded={open}
          >
            <MessageCircle className="w-6 h-6" aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="assistant-panel"
            role="dialog"
            aria-modal="false"
            aria-label="DocsGuard Assistant"
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 16, scale: prefersReducedMotion ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 16, scale: prefersReducedMotion ? 1 : 0.97 }}
            transition={panelTransition}
            className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 sm:w-[380px] h-[min(560px,calc(100vh-2rem))] sm:h-[560px] sm:max-h-[calc(100vh-6rem)] flex flex-col rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_20px_60px_-15px_rgba(15,23,42,0.25)] overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 flex items-start gap-3 px-4 py-3.5 border-b border-[#E2E8F0] bg-white">
              <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0" aria-hidden="true">
                <Sparkles className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-sm text-[#0F172A] leading-tight">DocsGuard Assistant</p>
                <p className="text-xs text-[#94A3B8] truncate">Grounded in this {report.documentType || 'document'} report</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 -m-1 rounded-lg text-[#94A3B8] hover:text-[#0F172A] hover:bg-[#F5F8FF] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                aria-label="Close assistant panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message list */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3" aria-live="polite">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Ask about the findings in this report — the assistant only draws on what was actually found here, and
                    says plainly when something still needs verification at source.
                  </p>
                  <div className="space-y-2">
                    {starterQuestions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => send(q)}
                        disabled={loading}
                        className="w-full text-left flex items-start gap-2 rounded-xl border border-[#E2E8F0] bg-white hover:bg-[#F5F8FF] hover:border-[#2563EB] disabled:opacity-50 disabled:cursor-not-allowed px-3.5 py-2.5 text-sm text-[#1E40AF] font-medium cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                      >
                        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#2563EB]" aria-hidden="true" />
                        <span>{q}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={
                      m.role === 'user'
                        ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-[#2563EB] text-white px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap'
                        : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-[#F5F8FF] border border-[#E2E8F0] text-[#0F172A] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap'
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-[#F5F8FF] border border-[#E2E8F0] text-[#475569] px-4 py-2.5 text-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" aria-hidden="true" />
                    <span>Thinking…</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 text-[#B91C1C]">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed">{error}</p>
                    {retryQuestion && (
                      <button
                        type="button"
                        onClick={() => send(retryQuestion)}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#B91C1C] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] rounded"
                      >
                        <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div ref={listEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-[#E2E8F0] px-3 py-3 bg-white">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  disabled={loading}
                  placeholder="Ask about this report…"
                  aria-label="Ask the DocsGuard Assistant a question about this report"
                  className="flex-1 min-w-0 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-0 transition-colors duration-200"
                />
                <button
                  type="button"
                  onClick={() => send(input)}
                  disabled={loading || !input.trim()}
                  aria-label="Send question"
                  className="shrink-0 w-10 h-10 rounded-xl bg-[#2563EB] hover:bg-[#1E40AF] disabled:bg-[#94A3B8] disabled:cursor-not-allowed text-white flex items-center justify-center cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AssistantPanel;
