import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  SectionHeading,
  SubHeading,
  Empty,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Selection {
  category: string;
  item_name: string;
  status: string;
  notes: string | null;
}

export interface SelectionsData {
  projectName: string;
  projectAddress: string;
  byCategory: Record<string, Selection[]>;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<SelectionsData> {
  const supabase = await createClient();
  const projectId = p.projectId!;

  // Fetch project
  const { data: proj } = await supabase
    .from("projects")
    .select("name, address")
    .eq("id", projectId)
    .single();

  // Fetch selections
  const { data: selectionsData } = await supabase
    .from("selections")
    .select("category, item_name, status, notes")
    .eq("project_id", projectId);

  const byCategory: Record<string, Selection[]> = {};
  for (const s of selectionsData ?? []) {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category]!.push(s);
  }

  // Sort categories and items within each category
  const sortedByCategory: Record<string, Selection[]> = {};
  for (const cat of Object.keys(byCategory).sort()) {
    sortedByCategory[cat] = byCategory[cat]!.sort((a, b) => a.item_name.localeCompare(b.item_name));
  }

  return {
    projectName: proj?.name ?? "—",
    projectAddress: proj?.address ?? "—",
    byCategory: sortedByCategory,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

const statusColor: Record<string, string> = {
  pending: colors.muted,
  selected: colors.brand,
  ordered: colors.orange,
  delivered: colors.orange,
  installed: colors.green,
};

export function Pdf({ data, params, logo }: { data: SelectionsData; params: ReportParams; logo?: Buffer | string }) {
  const categories = Object.keys(data.byCategory).sort();

  return (
    <ReportDocument
      title="Selections Status Report"
      subtitle={`${data.projectName} • ${data.projectAddress}`}
      logo={logo}
    >
      <SectionHeading>Selections by Category</SectionHeading>
      {categories.length === 0 ? (
        <Empty>No selections for this project.</Empty>
      ) : (
        <View>
          {categories.map((category) => {
            const items = data.byCategory[category]!;
            return (
              <View key={category} style={{ marginBottom: 12 }} wrap={false}>
                <SubHeading>{category}</SubHeading>
                <View style={{ marginLeft: 8 }}>
                  {items.map((item, i) => (
                    <View
                      key={i}
                      style={[
                        styles.tr,
                        i % 2 === 1 ? styles.trZebra : {},
                      ]}
                      wrap={false}
                    >
                      <View style={{ width: "55%" }}>
                        <Text style={styles.td}>{item.item_name}</Text>
                      </View>
                      <View style={{ width: "20%" }}>
                        <Text style={[styles.td, { color: statusColor[item.status] ?? colors.text, fontFamily: "Helvetica-Bold" }]}>
                          {item.status}
                        </Text>
                      </View>
                      <View style={{ width: "25%" }}>
                        <Text style={[styles.td, { color: colors.faint, fontSize: 8 }]}>
                          {item.notes || ""}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ReportDocument>
  );
}
