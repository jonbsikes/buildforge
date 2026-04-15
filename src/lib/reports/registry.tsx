import type { ReactElement } from "react";
import type { ReportSlug, ReportParams } from "./types";
import { getLogoDataUrl } from "./logo";

// Each report module exports:
//   getData(params) => Promise<Data>
//   Pdf({ data, params, logo }) => ReactElement
//
// We import them lazily (top-level) so the bundle is tree-shaken and any
// single report's data error surfaces as a clean 500 from the route handler.

import * as incomeStatement from "./reports/incomeStatement";
import * as balanceSheet from "./reports/balanceSheet";
import * as cashFlow from "./reports/cashFlow";
import * as financialSummary from "./reports/financialSummary";
import * as apAging from "./reports/apAging";
import * as wip from "./reports/wip";
import * as vendorSpend from "./reports/vendorSpend";
import * as taxExport from "./reports/taxExport";
import * as stageProgress from "./reports/stageProgress";
import * as fieldLogs from "./reports/fieldLogs";
import * as jobCost from "./reports/jobCost";
import * as budgetVariance from "./reports/budgetVariance";
import * as selections from "./reports/selections";
import * as gantt from "./reports/gantt";
import * as subdivisionOverview from "./reports/subdivisionOverview";

type ReportModule<D> = {
  getData: (p: ReportParams) => Promise<D>;
  Pdf: (args: { data: D; params: ReportParams; logo?: string }) => ReactElement;
};

const MODULES: Record<ReportSlug, ReportModule<any>> = {
  "income-statement": incomeStatement,
  "balance-sheet": balanceSheet,
  "cash-flow": cashFlow,
  "financial-summary": financialSummary,
  "ap-aging": apAging,
  "wip": wip,
  "vendor-spend": vendorSpend,
  "tax-export": taxExport,
  "stage-progress": stageProgress,
  "field-logs": fieldLogs,
  "job-cost": jobCost,
  "budget-variance": budgetVariance,
  "selections": selections,
  "gantt": gantt,
  "subdivision-overview": subdivisionOverview,
};

export async function renderReport(slug: ReportSlug, params: ReportParams): Promise<ReactElement> {
  const mod = MODULES[slug];
  if (!mod) throw new Error(`No module registered for report: ${slug}`);
  const data = await mod.getData(params);
  const logo = getLogoDataUrl();
  return mod.Pdf({ data, params, logo });
}
