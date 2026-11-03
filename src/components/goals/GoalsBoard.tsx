"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  addMilestone,
  createGoal,
  deleteGoal,
  deleteMilestone,
  reorderGoals,
  setGoalAchieved,
  setMilestoneDone,
  updateGoal,
} from "@/app/goals/actions";
import type { GoalRow } from "@/lib/goals-data";
import { isIsoDate } from "@/lib/month";
import {
  deadlineStatus,
  describeDeadline,
  formatDateSpan,
  formatShortDate,
  SUGGESTED_CATEGORIES,
  milestoneProgress,
  reorder,
  type Consistency,
} from "@/lib/routine";

type LinkedHabit = { name: string; schedule: string; consistency: Consistency };
type Goal = GoalRow & { habits: LinkedHabit[] };

/**
 * The goals list. Order is priority: the up and down arrows move a goal one
 * place and save the whole order at once. Achieved goals drop to their own
 * list at the bottom rather than disappearing.
 */
export function GoalsBoard({ goals, today }: { goals: Goal[]; today: string }) {
  const router = useRouter();
  const active = goals.filter((goal) => !goal.achieved_at);
  const achieved = goals.filter((goal) => goal.achieved_at);
  const [order, setOrder] = useState(() => active.map((goal) => goal.id));
  const [error, setError] = useState<string | null>(null);

  // A goal added or achieved since the last render joins or leaves the order.
  const ids = active.map((goal) => goal.id);
  const current = [
    ...order.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !order.includes(id)),
  ];
  const ordered = current.map((id) => active.find((goal) => goal.id === id)!);

  async function move(index: number, by: number) {
    const next = reorder(current, index, by);
    setOrder(next);
    setError(null);
    const result = await reorderGoals(next);
    if (!result.ok) {
      setError(result.error);
      setOrder(current);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <NewGoal />

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}

      {ordered.length === 0 ? (
        <p className="text-sm text-ink-muted">No goals in progress yet.</p>
      ) : (
        <ol className="space-y-2">
          {ordered.map((goal, index) => (
            <li key={goal.id}>
              <GoalCard
                goal={goal}
                rank={index + 1}
                today={today}
                onUp={index > 0 ? () => void move(index, -1) : undefined}
                onDown={index < ordered.length - 1 ? () => void move(index, 1) : undefined}
              />
            </li>
          ))}
        </ol>
      )}

      {achieved.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer p-4 font-medium">
            Achieved ({achieved.length})
          </summary>
          <ul className="divide-y divide-[var(--border)] border-t border-line">
            {achieved.map((goal) => (
              <AchievedGoal key={goal.id} goal={goal} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function NewGoal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [hasDeadline, setHasDeadline] = useState(true);
  const [deadline, setDeadline] = useState("");
  const [category, setCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [milestones, setMilestones] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Add a goal
      </button>
    );
  }

  async function save() {
    setError(null);
    if (hasDeadline && !isIsoDate(deadline)) {
      setError("Pick a deadline, or choose no deadline.");
      return;
    }
    setSaving(true);
    const result = await createGoal({
      title,
      notes: notes.trim() || null,
      deadline: hasDeadline ? deadline : null,
      category: category.trim() || null,
      startDate: startDate || null,
      milestones: milestones
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTitle("");
    setDeadline("");
    setCategory("");
    setStartDate("");
    setMilestones("");
    setNotes("");
    setOpen(false);
    router.refresh();
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">New goal</h2>
      <div className="space-y-1.5">
        <label htmlFor="goal-title" className="text-sm font-medium">
          Goal
        </label>
        <input
          id="goal-title"
          className="field"
          value={title}
          placeholder="Get my driver's licence"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Deadline</legend>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="goal-deadline"
              checked={hasDeadline}
              onChange={() => setHasDeadline(true)}
            />
            By
          </label>
          <input
            type="date"
            className="field max-w-[12rem]"
            aria-label="Deadline date"
            value={deadline}
            disabled={!hasDeadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="goal-deadline"
              checked={!hasDeadline}
              onChange={() => setHasDeadline(false)}
            />
            No deadline
          </label>
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="goal-milestones" className="text-sm font-medium">
          Milestones <span className="font-normal text-ink-muted">(optional, one per line)</span>
        </label>
        <textarea
          id="goal-milestones"
          className="field min-h-24"
          value={milestones}
          placeholder={"Book the learner's test\nPass the learner's\n10 driving lessons\nPass the test"}
          onChange={(event) => setMilestones(event.target.value)}
        />
      </div>

      <GoalExtras
        idPrefix="goal"
        category={category}
        onCategory={setCategory}
        startDate={startDate}
        onStartDate={setStartDate}
      />

      <div className="space-y-1.5">
        <label htmlFor="goal-notes" className="text-sm font-medium">
          Why it matters <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input
          id="goal-notes"
          className="field"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !title.trim()}
          onClick={() => void save()}
        >
          {saving ? "Saving..." : "Add goal"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        {error && (
          <span role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
            {error}
          </span>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        New goals go to the bottom of the list. Move them up to change their priority.
      </p>
    </section>
  );
}

function GoalCard({
  goal,
  rank,
  today,
  onUp,
  onDown,
}: {
  goal: Goal;
  rank: number;
  today: string;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [newMilestone, setNewMilestone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const status = deadlineStatus(goal.deadline, today);
  const progress = milestoneProgress(goal.milestones);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const result = await action();
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  const deadlineColor =
    status.kind === "overdue" || status.kind === "today"
      ? "var(--critical)"
      : status.kind === "upcoming" && status.daysLeft <= 14
        ? "var(--serious)"
        : undefined;

  return (
    <article className="card">
      <div className="flex items-start gap-3 p-4">
        <span
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-sunken text-sm font-semibold tabular"
          aria-label={`Priority ${rank}`}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          {goal.category && (
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {goal.category}
            </p>
          )}
          <h2 className="font-semibold leading-snug">{goal.title}</h2>
          <p className="text-sm">
            <span style={deadlineColor ? { color: deadlineColor } : undefined} className="font-medium">
              {describeDeadline(status)}
            </span>
            {formatDateSpan(goal.start_date, goal.deadline) && (
              <span className="text-ink-muted">
                {" "}
                · {formatDateSpan(goal.start_date, goal.deadline)}
              </span>
            )}
          </p>
          {progress.total > 0 && (
            <div className="flex items-center gap-2">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"
                role="progressbar"
                aria-valuenow={progress.done}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-label="Milestones done"
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <span className="text-xs text-ink-muted tabular">
                {progress.done}/{progress.total}
              </span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            className="btn size-9 !p-0"
            disabled={!onUp}
            onClick={onUp}
            aria-label={`Raise the priority of ${goal.title}`}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn size-9 !p-0"
            disabled={!onDown}
            onClick={onDown}
            aria-label={`Lower the priority of ${goal.title}`}
          >
            ↓
          </button>
        </div>
      </div>

      <details className="border-t border-line">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-accent">
          {goal.milestones.length > 0 ? "Milestones and details" : "Details"}
        </summary>
        <div className="space-y-4 px-4 pb-4">
          {goal.notes && <p className="text-sm text-ink-secondary">{goal.notes}</p>}

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Milestones</h3>
            {goal.milestones.length > 0 && (
              <ul className="space-y-1">
                {goal.milestones.map((milestone) => (
                  <li key={milestone.id} className="flex items-center gap-3">
                    <label className="flex min-h-10 flex-1 cursor-pointer items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="size-5 accent-[var(--accent)]"
                        checked={milestone.done_at !== null}
                        onChange={(event) =>
                          void run(() => setMilestoneDone(milestone.id, event.target.checked))
                        }
                      />
                      <span className={milestone.done_at ? "text-ink-muted line-through" : ""}>
                        {milestone.title}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="px-2 text-ink-muted hover:text-ink"
                      aria-label={`Remove milestone ${milestone.title}`}
                      onClick={() => void run(() => deleteMilestone(milestone.id))}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (await run(() => addMilestone(goal.id, newMilestone))) setNewMilestone("");
              }}
            >
              <label className="sr-only" htmlFor={`milestone-${goal.id}`}>
                New milestone for {goal.title}
              </label>
              <input
                id={`milestone-${goal.id}`}
                className="field"
                placeholder="Add a milestone"
                value={newMilestone}
                onChange={(event) => setNewMilestone(event.target.value)}
              />
              <button type="submit" className="btn" disabled={!newMilestone.trim()}>
                Add
              </button>
            </form>
          </section>

          {goal.habits.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-sm font-medium">Routine for this goal</h3>
              <ul className="space-y-1 text-sm">
                {goal.habits.map((habit) => (
                  <li key={habit.name} className="flex justify-between gap-3">
                    <span>
                      {habit.name} <span className="text-ink-muted">· {habit.schedule}</span>
                    </span>
                    <span className="tabular text-ink-secondary">
                      {habit.consistency.due === 0
                        ? "—"
                        : `${Math.round((habit.consistency.done / habit.consistency.due) * 100)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {editing ? (
            <EditGoal goal={goal} onDone={() => setEditing(false)} />
          ) : (
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void run(() => setGoalAchieved(goal.id, true))}
              >
                Mark achieved
              </button>
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-danger ml-auto"
                onClick={() => {
                  if (window.confirm(`Delete "${goal.title}" and its milestones?`)) {
                    void run(() => deleteGoal(goal.id));
                  }
                }}
              >
                Delete
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
              {error}
            </p>
          )}
        </div>
      </details>
    </article>
  );
}

function EditGoal({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(goal.title);
  const [deadline, setDeadline] = useState(goal.deadline ?? "");
  const [notes, setNotes] = useState(goal.notes ?? "");
  const [category, setCategory] = useState(goal.category ?? "");
  const [startDate, setStartDate] = useState(goal.start_date ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const result = await updateGoal({
      id: goal.id,
      title,
      notes: notes.trim() || null,
      deadline: deadline ? deadline : null,
      category: category.trim() || null,
      startDate: startDate || null,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div className="space-y-1.5">
        <label htmlFor={`edit-title-${goal.id}`} className="text-sm font-medium">
          Goal
        </label>
        <input
          id={`edit-title-${goal.id}`}
          className="field"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`edit-deadline-${goal.id}`} className="text-sm font-medium">
          Deadline <span className="font-normal text-ink-muted">(clear it for open-ended)</span>
        </label>
        <div className="flex gap-2">
          <input
            id={`edit-deadline-${goal.id}`}
            type="date"
            className="field max-w-[12rem]"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
          {deadline && (
            <button type="button" className="btn" onClick={() => setDeadline("")}>
              No deadline
            </button>
          )}
        </div>
      </div>
      <GoalExtras
        idPrefix={`edit-${goal.id}`}
        category={category}
        onCategory={setCategory}
        startDate={startDate}
        onStartDate={setStartDate}
      />
      <div className="space-y-1.5">
        <label htmlFor={`edit-notes-${goal.id}`} className="text-sm font-medium">
          Why it matters
        </label>
        <input
          id={`edit-notes-${goal.id}`}
          className="field"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!title.trim()}
          onClick={() => void save()}
        >
          Save
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        {error && (
          <span role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function AchievedGoal({ goal }: { goal: Goal }) {
  const router = useRouter();
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{goal.title}</span>
        <span className="text-xs text-ink-muted">
          Achieved {formatShortDate(goal.achieved_at!.slice(0, 10))}
        </span>
      </span>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          const result = await setGoalAchieved(goal.id, false);
          if (result.ok) router.refresh();
        }}
      >
        Reopen
      </button>
    </li>
  );
}

/** Category, and a start date for a focus block that runs between two dates. */
function GoalExtras({
  idPrefix,
  category,
  onCategory,
  startDate,
  onStartDate,
}: {
  idPrefix: string;
  category: string;
  onCategory: (value: string) => void;
  startDate: string;
  onStartDate: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-category`} className="text-sm font-medium">
          Category <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input
          id={`${idPrefix}-category`}
          className="field"
          list="goal-categories"
          value={category}
          placeholder="Career, Learning, Admin..."
          onChange={(event) => onCategory(event.target.value)}
        />
        <datalist id="goal-categories">
          {SUGGESTED_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-start`} className="text-sm font-medium">
          Starts <span className="font-normal text-ink-muted">(optional, for a focus block)</span>
        </label>
        <input
          id={`${idPrefix}-start`}
          type="date"
          className="field"
          value={startDate}
          onChange={(event) => onStartDate(event.target.value)}
        />
      </div>
    </div>
  );
}
