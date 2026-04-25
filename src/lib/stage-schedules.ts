// ============================================================
// stage-schedules.ts
// Source of truth for all stage definitions and date calculations.
//
// Home Construction (55 stages):
//   Dates are derived from the day-by-day schedule table in
//   .claude/memory/build_stages.md.  Each stage has a startOffset
//   and endOffset (0-indexed days from project start_date).
//   Multiple stages overlap — this is intentional.
//
// Land Development (24 stages):
//   No day-by-day schedule defined. Stages are spaced 7 days each,
//   sequentially. Users edit actual dates manually.
// ============================================================

export interface HomeStageDefinition {
  stage_number: number;
  stage_name: string;
  track: "exterior" | "interior";
  /** 0-indexed day offset from project start (inclusive) */
  startOffset: number;
  /** 0-indexed day offset from project start (inclusive) */
  endOffset: number;
}

export interface LandStageDefinition {
  stage_number: number;
  stage_name: string;
  days_to_complete: number;
}

export interface CalculatedStage {
  stage_number: number;
  stage_name: string;
  track: string | null;
  planned_start_date: string;
  planned_end_date: string;
  baseline_start_date: string;
  baseline_end_date: string;
}

// ---------------------------------------------------------------------------
// Home Construction — 55 stages
// Offsets derived directly from the day-by-day table in build_stages.md.
// Formula: startOffset = firstDay - 1, endOffset = lastDay - 1
//
// Stage 28 (Construction Clean - 4/7 - Brick) does not appear in the
// day-by-day table; it is scheduled for day 75 (offset 74), immediately
// after masonry ends, as a 1-day cleanup stage.
// ---------------------------------------------------------------------------
export const HOME_CONSTRUCTION_STAGES: HomeStageDefinition[] = [
  // Stage 1: days 1–2
  { stage_number:  1, stage_name: "Lot prep and layout",                         track: "exterior", startOffset:   0, endOffset:   1 },
  // Stage 2: days 2–3
  { stage_number:  2, stage_name: "Pad grading",                                 track: "exterior", startOffset:   1, endOffset:   2 },
  // Stage 3: day 4
  { stage_number:  3, stage_name: "Temp utilities & site setup",                 track: "exterior", startOffset:   3, endOffset:   3 },
  // Stage 4: days 5–6
  { stage_number:  4, stage_name: "Foundation - Set forms & Trench",             track: "exterior", startOffset:   4, endOffset:   5 },
  // Stage 5: days 7–9
  { stage_number:  5, stage_name: "Plumbing - Underground",                      track: "exterior", startOffset:   6, endOffset:   8 },
  // Stage 6: days 9–11
  { stage_number:  6, stage_name: "Electrical - Underground (ENT)",              track: "exterior", startOffset:   8, endOffset:  10 },
  // Stage 7: days 12–13
  { stage_number:  7, stage_name: "Foundation (cables/rebar)",                   track: "exterior", startOffset:  11, endOffset:  12 },
  // Stage 8: days 14–15
  { stage_number:  8, stage_name: "Pour slab",                                   track: "exterior", startOffset:  13, endOffset:  14 },
  // Stage 9: day 16
  { stage_number:  9, stage_name: "Construction Clean - 1/7 - Forms",            track: "exterior", startOffset:  15, endOffset:  15 },
  // Stage 10: days 17–18
  { stage_number: 10, stage_name: "Rough grade",                                 track: "exterior", startOffset:  16, endOffset:  17 },
  // Stage 11: days 19–23
  { stage_number: 11, stage_name: "Framing – walls & trusses",                   track: "exterior", startOffset:  18, endOffset:  22 },
  // Stage 12: days 24–25
  { stage_number: 12, stage_name: "Sheathing – walls and roof",                  track: "exterior", startOffset:  23, endOffset:  24 },
  // Stage 13: days 26–28
  { stage_number: 13, stage_name: "Weather barrier (WRB)",                       track: "exterior", startOffset:  25, endOffset:  27 },
  // Stage 14: days 29–34
  { stage_number: 14, stage_name: "Windows and exterior doors",                  track: "exterior", startOffset:  28, endOffset:  33 },
  // Stage 15: days 34–39
  { stage_number: 15, stage_name: "Water Well Install",                          track: "exterior", startOffset:  33, endOffset:  38 },
  // Stage 16: days 31–33 (interior, overlaps with stage 14)
  { stage_number: 16, stage_name: "Plumbing - Top‑Out",                          track: "interior", startOffset:  30, endOffset:  32 },
  // Stage 17: days 35–39 (interior, overlaps with stage 15)
  { stage_number: 17, stage_name: "HVAC - Rough",                                track: "interior", startOffset:  34, endOffset:  38 },
  // Stage 18: days 40–42
  { stage_number: 18, stage_name: "Roofing",                                     track: "exterior", startOffset:  39, endOffset:  41 },
  // Stage 19: days 40–45
  { stage_number: 19, stage_name: "Electrical - Rough",                          track: "interior", startOffset:  39, endOffset:  44 },
  // Stage 20: day 48
  { stage_number: 20, stage_name: "Construction Clean - 2/7 - Frame",            track: "exterior", startOffset:  47, endOffset:  47 },
  // Stage 21: days 43–48
  { stage_number: 21, stage_name: "Siding – exterior cladding",                  track: "exterior", startOffset:  42, endOffset:  47 },
  // Stage 22: days 46–50
  { stage_number: 22, stage_name: "Insulation",                                  track: "interior", startOffset:  45, endOffset:  49 },
  // Stage 23: days 51–61
  { stage_number: 23, stage_name: "Drywall – hang, tape, texture",               track: "interior", startOffset:  50, endOffset:  60 },
  // Stage 24: day 65
  { stage_number: 24, stage_name: "Construction Clean - 3/7 - Drywall",          track: "interior", startOffset:  64, endOffset:  64 },
  // Stage 25: days 62–64
  { stage_number: 25, stage_name: "Garage door - Rough (door and tracks)",       track: "exterior", startOffset:  61, endOffset:  63 },
  // Stage 26: days 75–80
  { stage_number: 26, stage_name: "Paint - Exterior",                            track: "exterior", startOffset:  74, endOffset:  79 },
  // Stage 27: days 66–74
  { stage_number: 27, stage_name: "Masonry/brick/stone",                         track: "exterior", startOffset:  65, endOffset:  73 },
  // Stage 28: day 75 (not in table; 1-day cleanup after masonry)
  { stage_number: 28, stage_name: "Construction Clean - 4/7 - Brick",            track: "exterior", startOffset:  74, endOffset:  74 },
  // Stage 29: days 82–86
  { stage_number: 29, stage_name: "Septic system rough in",                      track: "exterior", startOffset:  81, endOffset:  85 },
  // Stage 30: days 66–74 (interior, parallel with masonry)
  { stage_number: 30, stage_name: "Interior doors & trim",                       track: "interior", startOffset:  65, endOffset:  73 },
  // Stage 31: days 75–80 (interior, parallel with exterior paint)
  { stage_number: 31, stage_name: "Cabinets",                                    track: "interior", startOffset:  74, endOffset:  79 },
  // Stage 32: day 81
  { stage_number: 32, stage_name: "Construction Clean - 5/7 - Trim",             track: "interior", startOffset:  80, endOffset:  80 },
  // Stage 33: days 82–86
  { stage_number: 33, stage_name: "Paint - interior",                            track: "interior", startOffset:  81, endOffset:  85 },
  // Stage 34: days 92–95
  { stage_number: 34, stage_name: "Countertops",                                 track: "interior", startOffset:  91, endOffset:  94 },
  // Stage 35: days 92–95 (parallel with countertops)
  { stage_number: 35, stage_name: "Fireplace",                                   track: "interior", startOffset:  91, endOffset:  94 },
  // Stage 36: day 96
  { stage_number: 36, stage_name: "Construction Clean - 6/7 - Paint & Tile",     track: "interior", startOffset:  95, endOffset:  95 },
  // Stage 37: days 87–91
  { stage_number: 37, stage_name: "Flatwork – driveway, walks, patios",          track: "exterior", startOffset:  86, endOffset:  90 },
  // Stage 38: days 92–94 (exterior, parallel with countertops/fireplace)
  { stage_number: 38, stage_name: "Final grade",                                 track: "exterior", startOffset:  91, endOffset:  93 },
  // Stage 39: days 95–96 (exterior, parallel with clean 6/7)
  { stage_number: 39, stage_name: "Landscape/Irrigation - Rough",                track: "exterior", startOffset:  94, endOffset:  95 },
  // Stage 40: days 97–106
  { stage_number: 40, stage_name: "Flooring Install",                            track: "interior", startOffset:  96, endOffset: 105 },
  // Stage 41: days 107–110
  { stage_number: 41, stage_name: "Tile",                                        track: "interior", startOffset: 106, endOffset: 109 },
  // Stage 42: days 111–114
  { stage_number: 42, stage_name: "Electrical - Final",                          track: "interior", startOffset: 110, endOffset: 113 },
  // Stage 43: days 115–118
  { stage_number: 43, stage_name: "Plumbing - Final",                            track: "interior", startOffset: 114, endOffset: 117 },
  // Stage 44: days 119–122
  { stage_number: 44, stage_name: "HVAC - Final",                                track: "interior", startOffset: 118, endOffset: 121 },
  // Stage 45: days 123–125
  { stage_number: 45, stage_name: "Hardware",                                    track: "interior", startOffset: 122, endOffset: 124 },
  // Stage 46: days 126–128
  { stage_number: 46, stage_name: "Garage door - Final (operator/opener)",       track: "interior", startOffset: 125, endOffset: 127 },
  // Stage 47: days 129–131
  { stage_number: 47, stage_name: "Appliances",                                  track: "interior", startOffset: 128, endOffset: 130 },
  // Stage 48: days 132–134
  { stage_number: 48, stage_name: "Mirrors/Glass",                               track: "interior", startOffset: 131, endOffset: 133 },
  // Stage 49: days 135–137
  { stage_number: 49, stage_name: "Paint - interior finish & touch‑ups",         track: "interior", startOffset: 134, endOffset: 136 },
  // Stage 50: days 132–134 (exterior, parallel with stage 48)
  { stage_number: 50, stage_name: "Gutter install",                              track: "exterior", startOffset: 131, endOffset: 133 },
  // Stage 51: days 135–141 (exterior, fills gap left by final grade move)
  { stage_number: 51, stage_name: "Landscape - Final",                           track: "exterior", startOffset: 134, endOffset: 140 },
  // Stage 52: day 138 (interior, overlaps with Landscape - Final)
  { stage_number: 52, stage_name: "Construction Clean - 7/7 - Final",            track: "interior", startOffset: 137, endOffset: 137 },
  // Stage 53: days 139–146
  { stage_number: 53, stage_name: "Punch list & touch‑ups",                      track: "interior", startOffset: 138, endOffset: 145 },
  // Stage 54: day 147
  { stage_number: 54, stage_name: "Final Clean",                                 track: "interior", startOffset: 146, endOffset: 146 },
  // Stage 55: days 148–152
  { stage_number: 55, stage_name: "Final inspections & utility releases",        track: "interior", startOffset: 147, endOffset: 151 },
];

// ---------------------------------------------------------------------------
// Land Development — 24 stages, 7 days each (sequential)
// ---------------------------------------------------------------------------
export const LAND_DEV_STAGES: LandStageDefinition[] = [
  { stage_number:  1, stage_name: "Survey",                          days_to_complete: 7 },
  { stage_number:  2, stage_name: "Engineering",                     days_to_complete: 7 },
  { stage_number:  3, stage_name: "Environmental Study / Phase 1",   days_to_complete: 7 },
  { stage_number:  4, stage_name: "Geotechnical / Soil Testing",     days_to_complete: 7 },
  { stage_number:  5, stage_name: "Site Clearing",                   days_to_complete: 7 },
  { stage_number:  6, stage_name: "Earth Work",                      days_to_complete: 7 },
  { stage_number:  7, stage_name: "Detention / Retention Pond",      days_to_complete: 7 },
  { stage_number:  8, stage_name: "Water",                           days_to_complete: 7 },
  { stage_number:  9, stage_name: "Storm Sewer",                     days_to_complete: 7 },
  { stage_number: 10, stage_name: "Sanitary Sewer",                  days_to_complete: 7 },
  { stage_number: 11, stage_name: "Paving",                          days_to_complete: 7 },
  { stage_number: 12, stage_name: "Flatwork",                        days_to_complete: 7 },
  { stage_number: 13, stage_name: "Utilities - Electrical",          days_to_complete: 7 },
  { stage_number: 14, stage_name: "Utilities - Gas",                 days_to_complete: 7 },
  { stage_number: 15, stage_name: "Utilities - Internet",            days_to_complete: 7 },
  { stage_number: 16, stage_name: "Fencing",                         days_to_complete: 7 },
  { stage_number: 17, stage_name: "Monument Signs/Entry Features",   days_to_complete: 7 },
  { stage_number: 18, stage_name: "Postal Service Boxes",            days_to_complete: 7 },
  { stage_number: 19, stage_name: "Irrigation",                      days_to_complete: 7 },
  { stage_number: 20, stage_name: "Landscaping",                     days_to_complete: 7 },
  { stage_number: 21, stage_name: "Street Signs",                    days_to_complete: 7 },
  { stage_number: 22, stage_name: "Street Lights",                   days_to_complete: 7 },
  { stage_number: 23, stage_name: "HOA Setup",                       days_to_complete: 7 },
  { stage_number: 24, stage_name: "Final Plat Acceptance",           days_to_complete: 7 },
];

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// calculateHomeConstructionDates
// Uses the offset table above — stages overlap per the master schedule.
// ---------------------------------------------------------------------------
export function calculateHomeConstructionDates(
  startDateStr: string
): CalculatedStage[] {
  const start = new Date(startDateStr + "T00:00:00");

  return HOME_CONSTRUCTION_STAGES.map((s) => {
    const startDate = toDateStr(addDays(start, s.startOffset));
    const endDate   = toDateStr(addDays(start, s.endOffset));
    return {
      stage_number:         s.stage_number,
      stage_name:           s.stage_name,
      track:                s.track,
      planned_start_date:   startDate,
      planned_end_date:     endDate,
      baseline_start_date:  startDate,
      baseline_end_date:    endDate,
    };
  });
}

// ---------------------------------------------------------------------------
// calculateLandDevDates
// Sequential 7-day stages.
// ---------------------------------------------------------------------------
export function calculateLandDevDates(
  startDateStr: string
): CalculatedStage[] {
  const result: CalculatedStage[] = [];
  let cursor = new Date(startDateStr + "T00:00:00");

  for (const s of LAND_DEV_STAGES) {
    const startDate = toDateStr(cursor);
    const endDate   = toDateStr(addDays(cursor, s.days_to_complete - 1));

    result.push({
      stage_number:         s.stage_number,
      stage_name:           s.stage_name,
      track:                null,
      planned_start_date:   startDate,
      planned_end_date:     endDate,
      baseline_start_date:  startDate,
      baseline_end_date:    endDate,
    });

    cursor = addDays(cursor, s.days_to_complete);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Legacy shim — kept so existing callers don't break during migration.
// Delegates to the correct function based on stage count.
// ---------------------------------------------------------------------------
export { calculateHomeConstructionDates as calculateStageDates };
