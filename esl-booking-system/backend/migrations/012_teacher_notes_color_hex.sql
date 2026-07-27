-- 011 was already applied with note_color as a named key (VARCHAR(20) DEFAULT 'amber').
-- Switch it to a hex code column and migrate any existing key values to their hex equivalent.
ALTER TABLE teacher_notes
  MODIFY COLUMN note_color VARCHAR(7) NOT NULL DEFAULT '#FDE68A';

UPDATE teacher_notes
SET note_color = CASE note_color
  WHEN 'amber'  THEN '#FDE68A'
  WHEN 'red'    THEN '#FECACA'
  WHEN 'blue'   THEN '#BFDBFE'
  WHEN 'green'  THEN '#BBF7D0'
  WHEN 'purple' THEN '#E9D5FF'
  WHEN 'pink'   THEN '#FBCFE8'
  WHEN 'gray'   THEN '#E5E7EB'
  WHEN 'teal'   THEN '#99F6E4'
  ELSE '#FDE68A'
END
WHERE note_color NOT REGEXP '^#[0-9A-Fa-f]{6}$';
