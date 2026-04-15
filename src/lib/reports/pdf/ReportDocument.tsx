import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import { styles, COMPANY_NAME, page as pageCfg } from "./styles";
import type { ReactNode } from "react";

interface ReportDocumentProps {
  /** e.g. "Income Statement" */
  title: string;
  /** e.g. "For Jan 1, 2026 – Apr 15, 2026" or "As of Apr 15, 2026" */
  subtitle?: string;
  /** PNG logo bytes — Buffer works reliably across @react-pdf/renderer v4 */
  logo?: Buffer | string;
  /** orientation override — defaults to portrait */
  orientation?: "portrait" | "landscape";
  /** report body content */
  children: ReactNode;
  /** footer caption override (defaults to company name) */
  footerLeft?: string;
}

export function ReportDocument({
  title,
  subtitle,
  logo,
  orientation = "portrait",
  children,
  footerLeft,
}: ReportDocumentProps) {
  return (
    <Document title={title} author={COMPANY_NAME}>
      <Page size={pageCfg.size} orientation={orientation} style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            {logo ? (
              <Image src={logo as any} style={styles.logo} />
            ) : (
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 14 }}>{COMPANY_NAME}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>{title}</Text>
            {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
          </View>
        </View>
        <View style={styles.headerDivider} fixed />

        <View>{children}</View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{footerLeft ?? COMPANY_NAME}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
