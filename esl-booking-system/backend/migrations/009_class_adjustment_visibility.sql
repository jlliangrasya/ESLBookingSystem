-- Add class adjustment visibility setting to companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS show_class_adjustments BOOLEAN NOT NULL DEFAULT TRUE;
