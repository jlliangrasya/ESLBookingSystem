-- Let teachers pick a color (hex code, e.g. #FFBF00) and an emoji icon for their calendar notes
ALTER TABLE teacher_notes
  ADD COLUMN note_color VARCHAR(7) NOT NULL DEFAULT '#FDE68A',
  ADD COLUMN note_icon VARCHAR(10) NULL;
