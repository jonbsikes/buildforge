-- Migration: Renumber home construction build stages (54 → 55 stages)
--
-- Changes:
--   1. Move "Final grade" from old #49 → new #38
--   2. Insert new "Landscape/Irrigation - Rough" as #39
--   3. Old stages 38–48 shift to 40–50
--   4. Rename old "Landscape/irrigation" (#50) → "Landscape - Final" (#51)
--   5. Old stages 51–54 shift to 52–55
--
-- Strategy: Two-pass renumber via +1000 offset to avoid unique constraint
-- conflicts on (project_id, stage_number). Preserves all status, actual
-- dates, notes, and baseline data.

BEGIN;

-- =========================================================================
-- Pass 1: Shift affected stages (38–54) to temporary high numbers (+1000)
-- so we have a clear namespace to place final numbers.
-- =========================================================================
UPDATE build_stages bs
SET stage_number = bs.stage_number + 1000
FROM projects p
WHERE bs.project_id = p.id
  AND p.project_type = 'home_construction'
  AND bs.stage_number >= 38;

-- =========================================================================
-- Pass 2: Map from temporary numbers (1038–1054) to final numbers.
--
-- Old #  → Temp #  → New #   Stage name
-- 49     → 1049    → 38      Final grade
-- 38     → 1038    → 40      Flooring Install
-- 39     → 1039    → 41      Tile
-- 40     → 1040    → 42      Electrical - Final
-- 41     → 1041    → 43      Plumbing - Final
-- 42     → 1042    → 44      HVAC - Final
-- 43     → 1043    → 45      Hardware
-- 44     → 1044    → 46      Garage door - Final
-- 45     → 1045    → 47      Appliances
-- 46     → 1046    → 48      Mirrors/Glass
-- 47     → 1047    → 49      Paint - interior finish
-- 48     → 1048    → 50      Gutter install
-- 50     → 1050    → 51      Landscape - Final (renamed)
-- 51     → 1051    → 52      Construction Clean - 7/7
-- 52     → 1052    → 53      Punch list
-- 53     → 1053    → 54      Final Clean
-- 54     → 1054    → 55      Final inspections
-- =========================================================================

-- Old 49 (Final grade) → 38, move to exterior track
UPDATE build_stages bs
SET stage_number = 38, track = 'exterior'
FROM projects p
WHERE bs.project_id = p.id
  AND p.project_type = 'home_construction'
  AND bs.stage_number = 1049;

-- Old 38–48 → 40–50 (shift: temp - 1000 + 2)
UPDATE build_stages bs
SET stage_number = bs.stage_number - 1000 + 2
FROM projects p
WHERE bs.project_id = p.id
  AND p.project_type = 'home_construction'
  AND bs.stage_number >= 1038 AND bs.stage_number <= 1048;

-- Old 50 (Landscape/irrigation) → 51, rename to "Landscape - Final"
UPDATE build_stages bs
SET stage_number = 51, stage_name = 'Landscape - Final'
FROM projects p
WHERE bs.project_id = p.id
  AND p.project_type = 'home_construction'
  AND bs.stage_number = 1050;

-- Old 51–54 → 52–55 (shift: temp - 1000 + 1)
UPDATE build_stages bs
SET stage_number = bs.stage_number - 1000 + 1
FROM projects p
WHERE bs.project_id = p.id
  AND p.project_type = 'home_construction'
  AND bs.stage_number >= 1051 AND bs.stage_number <= 1054;

-- =========================================================================
-- Insert new stage 39 (Landscape/Irrigation - Rough) for every home
-- construction project. Dates: day after Final grade (38) ends, 2 days.
-- =========================================================================
INSERT INTO build_stages (
  project_id, stage_number, stage_name, track, status,
  planned_start_date, planned_end_date,
  baseline_start_date, baseline_end_date
)
SELECT
  p.id,
  39,
  'Landscape/Irrigation - Rough',
  'exterior',
  'not_started',
  (s38.planned_end_date::date + interval '1 day')::date,
  (s38.planned_end_date::date + interval '2 days')::date,
  (s38.planned_end_date::date + interval '1 day')::date,
  (s38.planned_end_date::date + interval '2 days')::date
FROM projects p
JOIN build_stages s38 ON s38.project_id = p.id AND s38.stage_number = 38
WHERE p.project_type = 'home_construction'
  AND NOT EXISTS (
    SELECT 1 FROM build_stages bs39
    WHERE bs39.project_id = p.id AND bs39.stage_number = 39
  );

COMMIT;
