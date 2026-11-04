"use client";

import { useEffect, useRef, useState } from "react";
import { markPostsRead } from "@/lib/classroom-api";
import type { StudentPost } from "@/lib/classroom";
import { refreshClassroomUnread } from "../useClassroomUnread";

/**
 * Marks the announcements a screen shows as read, once each, then catches the nav dot up. Pass the posts the screen shows
 * (keep the array's identity between renders, e.g. useMemo or the arrays of useStudentClassroom); a failed call is tried
 * again the next time the array changes. Returns the ids that were unread when this screen first saw them, so it can keep
 * their "New" badge for the visit (reading them clears the unread state on the server, and the next load says "read").
 */
export function useMarkPostsRead(posts: readonly StudentPost[]): ReadonlySet<string> {
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const unseen = posts.filter((p) => !p.read && !fresh.has(p.id));
  if (unseen.length > 0) setFresh(new Set([...fresh, ...unseen.map((p) => p.id)]));

  const marked = useRef(new Set<string>());
  useEffect(() => {
    const ids = posts.filter((p) => !p.read && !marked.current.has(p.id)).map((p) => p.id);
    if (ids.length === 0) return;
    for (const id of ids) marked.current.add(id);
    markPostsRead(ids).then(
      () => refreshClassroomUnread(),
      () => {
        for (const id of ids) marked.current.delete(id); // try again on the next load
      },
    );
  }, [posts]);

  return fresh;
}
