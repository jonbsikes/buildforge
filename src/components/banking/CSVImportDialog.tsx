"use client";

import { useState, useRef, useTransition } from "react";
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { importBankTransactions } from "@/app/actions/bank-transactions";

interface Props {
  bankAccountId: string;
  accountName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CSVImportDialog({ bankAccountId, accountName, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ imported: number; skipped: number; matched: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.trim().split(/\r?\n/).slice(0, 6); // header + 5 rows
      const rows = lines.map((l) => l.split(",").map((c) => c.trim()));
      setPreview(rows);
    };
    reader.readAsText(f);
  }

  function handleImport() {
    if (!file) return;
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target?.result as string;
      startTransition(async () => {
        const res = await importBankTransactions(bankAccountId, csvText);
        if (res.error) {
          setError(res.error);
        } else {
          setResult({ imported: res.imported, skipped: res.skipped, matched: res.matched });
        }
      });
    };
    reader.readAsText(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-[#4272EF]" />
            <h2 className="text-base font-semibold text-gray-900">Import Bank Transactions</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600">
            Import a CSV bank statement into <strong>{accountName}</strong>. Duplicate transactions will be automatically skipped.
          </p>

          {/* File drop zone */}
          {!result && (
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-[#4272EF] hover:bg-blue-50/30 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const f = e.dataTransfer.files[0];
                if (f && f.name.endsWith(".csv")) handleFile(f);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <Upload size={24} className="mx-auto text-gray-400 mb-2" />
              {file ? (
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">Drop CSV file here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">Supported format: Bank statement CSV export</p>
                </>
              )}
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && !result && (
            <div className="overflow-x-auto">
              <p className="text-xs font-medium text-gray-500 mb-2">Preview (first 5 rows)</p>
              <table className="w-full text-xs border border-gray-200 rounded">
                <thead>
                  <tr className="bg-gray-50">
                    {preview[0]?.map((h, i) => (
                      <th key={i} className="px-2 py-1.5 text-left font-medium text-gray-600 border-b border-gray-200">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(1).map((row, ri) => (
                    <tr key={ri} className="border-b border-gray-100">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-2 py-1 text-gray-700 whitespace-nowrap">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Success */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-green-800">
                  <p className="font-medium">Import complete!</p>
                  <ul className="mt-1 space-y-0.5 text-green-700">
                    <li>{result.imported} transactions imported</li>
                    {result.skipped > 0 && <li>{result.skipped} duplicates skipped</li>}
                    <li>{result.matched} auto-matched to existing records</li>
                  </ul>
                </div>
              </div>
              {result.imported - result.matched > 0 && (
                <p className="text-xs text-gray-500">
                  {result.imported - result.matched} unmatched transactions — review them on the Reconciliation page.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
          {result ? (
            <button
              onClick={() => { onSuccess(); onClose(); }}
              className="px-4 py-2 text-sm bg-[#4272EF] text-white rounded-lg hover:bg-[#3461de] transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!file || isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-[#4272EF] text-white rounded-lg hover:bg-[#3461de] disabled:opacity-60 transition-colors"
              >
                {isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Import
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
