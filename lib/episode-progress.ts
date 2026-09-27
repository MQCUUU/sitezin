export type EpisodeJournalWrite = {
  commentProvided: boolean;
  comment: string | null;
  isRewatchProvided: boolean;
  isRewatch: boolean;
};

/**
 * Normalize journal fields for POST /api/episodes. The provided flags are
 * part of the persistence contract: SQL preserves stored values when a
 * quick watched toggle omits these fields, while an explicit empty comment
 * clears it and an explicit false resets the rewatch flag.
 */
export function getEpisodeJournalWrite(input: {
  comment?: unknown;
  is_rewatch?: unknown;
}): EpisodeJournalWrite {
  const commentProvided = typeof input.comment === "string";
  const isRewatchProvided = typeof input.is_rewatch === "boolean";

  return {
    commentProvided,
    comment: typeof input.comment === "string"
      ? input.comment.trim().slice(0, 4000) || null
      : null,
    isRewatchProvided,
    isRewatch: input.is_rewatch === true,
  };
}
