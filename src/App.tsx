import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RotateCcw, Check } from 'lucide-react';

interface GoalState {
  name: string;
  target: number;
  entries: number[];
}

interface AchievedGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
  completedAt: string;
}

const STORAGE_KEY = 'minimal_single_goal_savings_v1';
const HISTORY_STORAGE_KEY = 'minimal_single_goal_history_v1';
const MAX_TARGET_DH = 200;
const QUICK_AMOUNTS = [3, 5, 10] as const;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatAmount(value: number): string {
  const rounded = roundCurrency(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

function loadStoredGoal(): GoalState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'name' in parsed &&
      'target' in parsed &&
      'entries' in parsed
    ) {
      const candidate = parsed as { name: unknown; target: unknown; entries: unknown };
      if (
        typeof candidate.name === 'string' &&
        candidate.name.trim().length > 0 &&
        typeof candidate.target === 'number' &&
        Number.isFinite(candidate.target) &&
        candidate.target > 0 &&
        candidate.target <= MAX_TARGET_DH &&
        Array.isArray(candidate.entries) &&
        candidate.entries.every((e) => typeof e === 'number' && Number.isFinite(e) && e > 0)
      ) {
        return {
          name: candidate.name,
          target: roundCurrency(candidate.target),
          entries: candidate.entries.map(roundCurrency),
        };
      }
    }
  } catch {
    // Ignore storage read or parse errors
  }
  return null;
}

function loadStoredHistory(): AchievedGoal[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is AchievedGoal => {
        if (typeof item !== 'object' || item === null) return false;
        const candidate = item as Record<string, unknown>;
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.name === 'string' &&
          candidate.name.trim().length > 0 &&
          typeof candidate.target === 'number' &&
          Number.isFinite(candidate.target) &&
          typeof candidate.saved === 'number' &&
          Number.isFinite(candidate.saved) &&
          typeof candidate.completedAt === 'string'
        );
      })
      .map((item) => ({
        ...item,
        target: roundCurrency(item.target),
        saved: roundCurrency(item.saved),
      }));
  } catch {
    return [];
  }
}

function formatCompletedDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function App() {
  const [goal, setGoal] = useState<GoalState | null>(() => loadStoredGoal());
  const [history, setHistory] = useState<AchievedGoal[]>(() => loadStoredHistory());

  // Create Goal form state
  const [goalNameInput, setGoalNameInput] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Custom quick-add input state
  const [customAmountInput, setCustomAmountInput] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Sync goal state to localStorage
  useEffect(() => {
    try {
      if (goal) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(goal));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage write errors
    }
  }, [goal]);

  // Sync achieved goals history to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore storage write errors
    }
  }, [history]);

  const savedAmount = goal
    ? roundCurrency(goal.entries.reduce((sum, entry) => sum + entry, 0))
    : 0;

  const isCompleted = goal !== null && savedAmount >= goal.target;

  const progressPercentage =
    goal && goal.target > 0
      ? Math.min(100, Math.round((savedAmount / goal.target) * 100))
      : 0;

  const remainingAmount = goal ? Math.max(0, roundCurrency(goal.target - savedAmount)) : 0;

  const handleStartGoal = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedName = goalNameInput.trim();
      const parsedTarget = Number(targetInput);

      if (!trimmedName) {
        setCreateError('Enter a goal name.');
        return;
      }

      if (!targetInput.trim() || !Number.isFinite(parsedTarget) || parsedTarget <= 0) {
        setCreateError('Target amount must be greater than 0 DH.');
        return;
      }

      if (parsedTarget > MAX_TARGET_DH) {
        setCreateError(`Target amount cannot exceed ${MAX_TARGET_DH} DH.`);
        return;
      }

      setCreateError(null);
      setGoal({
        name: trimmedName,
        target: roundCurrency(parsedTarget),
        entries: [],
      });
      setGoalNameInput('');
      setTargetInput('');
      setCustomAmountInput('');
      setCustomError(null);
    },
    [goalNameInput, targetInput]
  );

  const handleAddAmount = useCallback(
    (amount: number) => {
      if (!goal || isCompleted) return;
      if (!Number.isFinite(amount) || amount <= 0) return;

      const cleanAmount = roundCurrency(amount);
      setGoal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          entries: [...prev.entries, cleanAmount],
        };
      });
      setCustomError(null);
    },
    [goal, isCompleted]
  );

  const handleCustomAdd = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const parsed = Number(customAmountInput);
      if (!customAmountInput.trim() || !Number.isFinite(parsed) || parsed <= 0) {
        setCustomError('Enter an amount above 0 DH.');
        return;
      }
      handleAddAmount(parsed);
      setCustomAmountInput('');
    },
    [customAmountInput, handleAddAmount]
  );

  const handleUndoLast = useCallback(() => {
    setGoal((prev) => {
      if (!prev || prev.entries.length === 0) return prev;
      return {
        ...prev,
        entries: prev.entries.slice(0, -1),
      };
    });
    setCustomError(null);
  }, []);

  const handleNewGoal = useCallback(() => {
    if (goal && savedAmount >= goal.target) {
      const archived: AchievedGoal = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: goal.name,
        target: goal.target,
        saved: savedAmount,
        completedAt: new Date().toISOString(),
      };
      setHistory((prev) => [archived, ...prev]);
    }
    setGoal(null);
    setGoalNameInput('');
    setTargetInput('');
    setCreateError(null);
    setCustomAmountInput('');
    setCustomError(null);
  }, [goal, savedAmount]);

  const lastEntry = goal && goal.entries.length > 0 ? goal.entries[goal.entries.length - 1] : null;

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF] text-[#000000] flex flex-col items-center justify-center px-6 py-12 selection:bg-[#000000] selection:text-[#FFFFFF]">
      <main className="w-full max-w-[440px] flex flex-col gap-6">
        {/* STATE 1: CREATE GOAL SCREEN */}
        {goal === null && (
          <section aria-label="Create Goal" className="border border-[#000000] p-8 bg-[#FFFFFF]">
            <h1 className="text-xl font-bold tracking-tight mb-6">New Goal</h1>

            <form onSubmit={handleStartGoal} noValidate className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label htmlFor="goal-name" className="text-xs font-semibold uppercase tracking-wider">
                  Goal
                </label>
                <input
                  id="goal-name"
                  type="text"
                  value={goalNameInput}
                  onChange={(e) => {
                    setGoalNameInput(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  placeholder="Product X"
                  maxLength={60}
                  autoComplete="off"
                  className="w-full min-h-[46px] px-4 py-2.5 bg-[#FFFFFF] text-[#000000] border border-[#000000] text-base placeholder:text-[#000000]/35 focus:outline-none focus-visible:outline-2 focus-visible:outline-[#000000] focus-visible:outline-offset-2"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="target-amount" className="text-xs font-semibold uppercase tracking-wider">
                    Target (DH)
                  </label>
                  <span className="font-mono text-xs tabular-nums">Max {MAX_TARGET_DH}</span>
                </div>
                <div className="relative flex items-center">
                  <input
                    id="target-amount"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={MAX_TARGET_DH}
                    step="any"
                    value={targetInput}
                    onChange={(e) => {
                      setTargetInput(e.target.value);
                      if (createError) setCreateError(null);
                    }}
                    placeholder="200"
                    className="w-full min-h-[46px] pl-4 pr-14 py-2.5 bg-[#FFFFFF] text-[#000000] border border-[#000000] font-mono text-base tabular-nums placeholder:text-[#000000]/35 focus:outline-none focus-visible:outline-2 focus-visible:outline-[#000000] focus-visible:outline-offset-2"
                  />
                  <span className="absolute right-4 font-mono text-sm font-semibold pointer-events-none select-none">
                    DH
                  </span>
                </div>
              </div>

              {createError && (
                <div
                  role="alert"
                  className="border border-[#000000] px-4 py-2.5 text-xs font-medium bg-[#000000] text-[#FFFFFF]"
                >
                  {createError}
                </div>
              )}

              <button
                type="submit"
                className="w-full min-h-[48px] px-6 py-3 mt-1 bg-[#000000] text-[#FFFFFF] border border-[#000000] text-sm font-semibold tracking-widest uppercase cursor-pointer transition-colors duration-150 hover:bg-[#FFFFFF] hover:text-[#000000] focus-visible:outline-2 focus-visible:outline-[#000000] focus-visible:outline-offset-2"
              >
                START GOAL
              </button>
            </form>
          </section>
        )}

        {/* STATE 2: ACTIVE GOAL SCREEN (LOCKED UNTIL 100% COMPLETED) */}
        {goal !== null && !isCompleted && (
          <section aria-label="Active Goal" className="border border-[#000000] p-8 bg-[#FFFFFF]">
            <div className="flex items-baseline justify-between gap-4 pb-6 border-b border-[#000000]">
              <h1 className="text-2xl font-bold tracking-tight break-words min-w-0">
                {goal.name}
              </h1>
              <span className="font-mono text-2xl font-bold tabular-nums shrink-0">
                {progressPercentage}%
              </span>
            </div>

            <div className="py-7 border-b border-[#000000]">
              <div className="flex items-baseline justify-between gap-4 mb-3.5">
                <div className="font-mono text-3xl font-bold tabular-nums tracking-tight">
                  {formatAmount(savedAmount)}{' '}
                  <span className="text-lg font-normal">/ {formatAmount(goal.target)} DH</span>
                </div>
                <span className="font-mono text-xs tabular-nums whitespace-nowrap">
                  {formatAmount(remainingAmount)} DH left
                </span>
              </div>

              <div
                role="progressbar"
                aria-label="Savings progress"
                aria-valuenow={progressPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
                className="w-full h-7 border border-[#000000] bg-[#FFFFFF] overflow-hidden"
              >
                <div
                  className="h-full bg-[#000000] transition-[width] duration-150 ease-out"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            <div className="pt-7 flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                {QUICK_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => handleAddAmount(amount)}
                    className="min-h-[48px] px-3 py-2.5 border border-[#000000] bg-[#FFFFFF] text-[#000000] font-mono text-sm font-semibold tabular-nums flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 hover:bg-[#000000] hover:text-[#FFFFFF] focus-visible:outline-2 focus-visible:outline-[#000000] focus-visible:outline-offset-2 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
                    <span>{amount} DH</span>
                  </button>
                ))}
              </div>

              <form onSubmit={handleCustomAdd} noValidate className="flex flex-col gap-2">
                <div className="flex items-stretch">
                  <div className="relative flex-1 flex items-center">
                    <input
                      id="custom-amount"
                      aria-label="Custom amount in DH"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="any"
                      value={customAmountInput}
                      onChange={(e) => {
                        setCustomAmountInput(e.target.value);
                        if (customError) setCustomError(null);
                      }}
                      placeholder="Other DH"
                      className="w-full min-h-[46px] pl-4 pr-12 py-2 bg-[#FFFFFF] text-[#000000] border border-[#000000] border-r-0 font-mono text-sm tabular-nums placeholder:text-[#000000]/35 focus:outline-none focus-visible:outline-2 focus-visible:outline-[#000000] focus-visible:outline-offset-2"
                    />
                    <span className="absolute right-3 font-mono text-xs font-semibold pointer-events-none select-none">
                      DH
                    </span>
                  </div>
                  <button
                    type="submit"
                    aria-label="Add custom amount"
                    className="min-h-[46px] min-w-[54px] px-4 bg-[#000000] text-[#FFFFFF] border border-[#000000] flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-[#FFFFFF] hover:text-[#000000] focus-visible:outline-2 focus-visible:outline-[#000000] focus-visible:outline-offset-2"
                  >
                    <Plus className="w-5 h-5" strokeWidth={2.25} />
                  </button>
                </div>
                {customError && (
                  <p role="alert" className="text-xs font-medium">
                    {customError}
                  </p>
                )}
              </form>

              <div className="pt-2 border-t border-[#000000] flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleUndoLast}
                  disabled={goal.entries.length === 0}
                  className="min-h-[40px] px-2 -ml-2 inline-flex items-center gap-2 text-xs font-medium underline underline-offset-4 cursor-pointer disabled:opacity-35 disabled:no-underline disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#000000] focus-visible:outline-offset-2"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                  <span>
                    Undo last{lastEntry !== null ? ` (+${formatAmount(lastEntry)} DH)` : ''}
                  </span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* STATE 3: COMPLETION STATE */}
        {goal !== null && isCompleted && (
          <section aria-label="Goal Reached" className="border border-[#000000] p-8 bg-[#FFFFFF]">
            <div className="flex items-center gap-3 pb-6 border-b border-[#000000]">
              <div className="w-9 h-9 bg-[#000000] text-[#FFFFFF] flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight uppercase">
                GOAL REACHED
              </h1>
            </div>

            <div className="py-7 border-b border-[#000000]">
              <p className="text-xl font-bold tracking-tight mb-3 break-words">
                {goal.name}
              </p>

              <div className="font-mono text-3xl font-bold tabular-nums mb-4">
                {formatAmount(savedAmount)}{' '}
                <span className="text-lg font-normal">/ {formatAmount(goal.target)} DH</span>
              </div>

              <div
                role="progressbar"
                aria-label="Savings progress complete"
                aria-valuenow={100}
                aria-valuemin={0}
                aria-valuemax={100}
                className="w-full h-7 border border-[#000000] bg-[#000000]"
              />
            </div>

            <div className="pt-7">
              <button
                type="button"
                onClick={handleNewGoal}
                className="w-full min-h-[48px] px-6 py-3 bg-[#000000] text-[#FFFFFF] border border-[#000000] text-sm font-semibold tracking-widest uppercase cursor-pointer transition-colors duration-150 hover:bg-[#FFFFFF] hover:text-[#000000] focus-visible:outline-2 focus-visible:outline-[#000000] focus-visible:outline-offset-2"
              >
                NEW GOAL
              </button>
            </div>
          </section>
        )}

        {/* ACHIEVED GOALS HISTORY */}
        {history.length > 0 && (
          <section aria-label="Achieved Goals" className="border border-[#000000] bg-[#FFFFFF]">
            <div className="px-6 py-3.5 border-b border-[#000000] flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider">
                Achieved
              </h2>
              <span className="font-mono text-xs tabular-nums">
                {history.length}
              </span>
            </div>
            <ul className="divide-y divide-[#000000]">
              {history.map((item) => (
                <li
                  key={item.id}
                  className="px-6 py-3.5 flex items-baseline justify-between gap-4"
                >
                  <span className="text-sm font-semibold truncate min-w-0">
                    {item.name}
                  </span>
                  <div className="flex items-baseline gap-3 shrink-0 font-mono text-xs tabular-nums">
                    <span className="font-semibold">
                      {formatAmount(item.saved)} DH
                    </span>
                    <span className="opacity-60">
                      {formatCompletedDate(item.completedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
