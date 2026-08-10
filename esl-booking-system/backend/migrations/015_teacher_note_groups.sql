-- Merged notes: a note that spans several consecutive 30-min slots (e.g. 8:00 PM – 9:30 PM)
-- is still stored as one row per slot, but every row shares a note_group_id so the weekly
-- grid can render the run as a single merged cell and edits/removals apply to the whole block.
-- NULL = a standalone single-slot note (the pre-existing behaviour).
ALTER TABLE teacher_notes
  ADD COLUMN note_group_id VARCHAR(36) NULL;

CREATE INDEX idx_note_group ON teacher_notes (company_id, teacher_id, note_group_id);
