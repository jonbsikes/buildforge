-- Migration 007: Add track column to build_stages
-- Track identifies whether a stage belongs to the Exterior or Interior Gantt track
-- (Home Construction only; NULL for Land Development)

ALTER TABLE build_stages
  ADD COLUMN IF NOT EXISTS track text;

-- Populate track for existing home construction stages based on the master stage list
-- Exterior: 1-15, 18, 20, 21, 25-29, 37, 48-50
-- Interior: 16, 17, 19, 22-24, 30-36, 38-47, 51-54
UPDATE build_stages
SET track = CASE
  WHEN stage_number IN (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,18,20,21,25,26,27,28,29,37,48,49,50)
    THEN 'exterior'
  WHEN stage_number IN (16,17,19,22,23,24,30,31,32,33,34,35,36,38,39,40,41,42,43,44,45,46,47,51,52,53,54)
    THEN 'interior'
  ELSE NULL
END
WHERE project_id IN (
  SELECT id FROM projects WHERE project_type = 'home_construction'
);
