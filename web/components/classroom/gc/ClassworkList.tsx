"use client";

import { byTopic } from "@/lib/classwork";
import { taskPath } from "@/lib/classes-home";
import type { StudentTask } from "@/lib/tasks";
import { AnchorChip } from "../AnchorChip";
import { LinkedText } from "../LinkedText";
import { WorkRow } from "./WorkRow";

/** What a task row shows when it opens: the instructions and, when the task is about an item, the item's chip. Undefined when there is neither. */
function taskDetails(task: StudentTask) {
  if (!task.details && !task.about) return undefined;
  return (
    <div className="space-y-2">
      {task.details && (
        <p>
          <LinkedText text={task.details} />
        </p>
      )}
      {task.about && <AnchorChip info={task.about} role="student" />}
    </div>
  );
}

/**
 * A list of the student's tasks grouped by topic (lib/classwork.ts byTopic): tasks without a topic first and under no
 * heading, then each topic with its newest work first. Every row opens in place and links to the task page. Used for a
 * class's Classwork and for the private tasks on the 1-on-1 page. Renders nothing for an empty list; the screen says
 * what an empty list means. `today` is the reader's local `YYYY-MM-DD`. `headingLevel` is the level of the topic headings
 * (2 where the page has no other h2 above them, else the default 3); their look does not change.
 */
export function ClassworkList({ tasks, today, headingLevel = 3 }: { tasks: readonly StudentTask[]; today: string; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="space-y-6">
      {byTopic(tasks).map((group) => (
        <section key={group.topic ?? ""} className="space-y-1">
          {group.topic !== null && <Heading className="border-b border-neutral-line pb-2 font-display text-lg font-bold text-ink [overflow-wrap:anywhere]">{group.topic}</Heading>}
          <ul>
            {group.items.map((task) => (
              <li key={task.id}>
                <WorkRow item={task} today={today} href={taskPath(task.id)} expandable details={taskDetails(task)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
