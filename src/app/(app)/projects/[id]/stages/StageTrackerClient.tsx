// @ts-nocheck
"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle2, Circle, Clock, XCircle, ChevronDown, ChevronUp, Plus, Check, Image, FileText, Upload, ExternalLink } from "lucide-react";
import type { StageStatus } from "@/types/database";

interface MasterStage { stage_number: number; name: string; }
interface ProjectStage {
  id: string;
  project_id: string;
  stage_number: number;
  status: StageStatus;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  notes: string | null;
}

interface StagePhoto {
  id: string;
  project_stage_id: string;
  file_url: string;
  caption: string | null;
}

interface StageDocument {
  id: string;
  project_stage_id: string;
  file_url: string;
  document_type: string | null;
  name: string | null;
}

interface Props {
  projectId: string;
  masterStages: MasterStage[];
  projectStages: ProjectStage[];
}

const statusConfig: Record<StageStatus, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  not_started: { label: "Not Started", icon: <Circle size={16} />, color: "text-gray-400", bg: "bg-gray-100" },
  in_progress: { label: "In Progress", icon: <Clock size={16} />, color: "text-blue-600", bg: "bg-blue-50" },
  completed: { label: "Complete", icon: <CheckCircle2 size={16} />, color: "text-green-600", bg: "bg-green-50" },
  blocked: { label: "Blocked", icon: <XCircle size={16} />, color: "text-red-500", bg: "bg-red-50" },
};

function fmtDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function StageTrackerClient({ projectId, masterStages, projectStages: initial }: Props) {
  const supabase = createClient();
  const [stages, setStages] = useState<ProjectStage[]>(initial);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<number, Partial<ProjectStage>>>({});

  // Photos/docs state per stage id
  const [photos, setPhotos] = useState<Record<string, StagePhoto[]>>({});
  const [documents, setDocuments] = useState<Record<string, StageDocument[]>>({});
  const [loadedMedia, setLoadedMedia] = useState<Set<string>>(new Set());
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [photoCaptions, setPhotoCaptions] = useState<Record<string, string>>({});
  const [docTypes, setDocTypes] = useState<Record<string, string>>({});
  const [docNames, setDocNames] = useState<Record<string, string>>({});

  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const docInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Build a map from stage_number → project stage
  const stageMap = new Map(stages.map((s) => [s.stage_number, s]));

  const completedCount = stages.filter((s) => s.status === "completed").length;
  const inProgressCount = stages.filter((s) => s.status === "in_progress").length;
  const totalActivated = stages.length;
  const pct = masterStages.length > 0 ? Math.round((completedCount / masterStages.length) * 100) : 0;

  async function loadMedia(stageId: string) {
    if (loadedMedia.has(stageId)) return;
    const [photosRes, docsRes] = await Promise.all([
      supabase.from("stage_photos").select("*").eq("project_stage_id", stageId),
      supabase.from("stage_documents").select("*").eq("project_stage_id", stageId),
    ]);
    setPhotos((prev) => ({ ...prev, [stageId]: (photosRes.data ?? []) as StagePhoto[] }));
    setDocuments((prev) => ({ ...prev, [stageId]: (docsRes.data ?? []) as StageDocument[] }));
    setLoadedMedia((prev) => new Set([...prev, stageId]));
  }

  function toggleExpanded(num: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(num)) {
        next.delete(num);
      } else {
        next.add(num);
        const ps = stageMap.get(num);
        if (ps) loadMedia(ps.id);
      }
      return next;
    });
  }

  function setEdit(num: number, field: string, value: string) {
    setEditValues((prev) => ({ ...prev, [num]: { ...(prev[num] ?? {}), [field]: value } }));
  }

  async function activateStage(stageNumber: number) {
    setSaving(stageNumber);
    const { data, error } = await supabase.from("project_stages").insert({
      project_id: projectId,
      stage_number: stageNumber,
      status: "not_started",
    }).select("*").single();
    if (!error && data) {
      setStages((prev) => [...prev, data as ProjectStage]);
      setExpanded((prev) => {
        const next = new Set([...prev, stageNumber]);
        loadMedia((data as ProjectStage).id);
        return next;
      });
    }
    setSaving(null);
  }

  async function updateStatus(stage: ProjectStage, status: StageStatus) {
    setSaving(stage.stage_number);
    const updates: Partial<ProjectStage> = { status };
    if (status === "in_progress" && !stage.actual_start) {
      updates.actual_start = new Date().toISOString().split("T")[0];
    }
    if (status === "completed" && !stage.actual_end) {
      updates.actual_end = new Date().toISOString().split("T")[0];
    }
    await supabase.from("project_stages").update(updates).eq("id", stage.id);
    setStages((prev) => prev.map((s) => s.id === stage.id ? { ...s, ...updates } : s));
    setSaving(null);
  }

  async function saveDetails(stage: ProjectStage) {
    const edits = editValues[stage.stage_number] ?? {};
    if (Object.keys(edits).length === 0) return;
    setSaving(stage.stage_number);
    await supabase.from("project_stages").update(edits).eq("id", stage.id);
    setStages((prev) => prev.map((s) => s.id === stage.id ? { ...s, ...edits } : s));
    setEditValues((prev) => { const next = { ...prev }; delete next[stage.stage_number]; return next; });
    setSaving(null);
  }

  async function uploadPhoto(stageId: string, file: File) {
    setUploadingPhoto(stageId);
    const ext = file.name.split(".").pop();
    const path = `${projectId}/${stageId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("stage-photos").upload(path, file);
    if (upErr) { setUploadingPhoto(null); return; }
    const { data: urlData } = supabase.storage.from("stage-photos").getPublicUrl(path);
    const caption = photoCaptions[stageId] ?? "";
    const { data, error } = await supabase.from("stage_photos").insert({
      project_stage_id: stageId,
      file_url: urlData.publicUrl,
      caption: caption || null,
    }).select("*").single();
    if (!error && data) {
      setPhotos((prev) => ({ ...prev, [stageId]: [...(prev[stageId] ?? []), data as StagePhoto] }));
      setPhotoCaptions((prev) => ({ ...prev, [stageId]: "" }));
    }
    // Reset file input
    if (photoInputRefs.current[stageId]) photoInputRefs.current[stageId]!.value = "";
    setUploadingPhoto(null);
  }

  async function uploadDocument(stageId: string, file: File) {
    setUploadingDoc(stageId);
    const ext = file.name.split(".").pop();
    const path = `${projectId}/${stageId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("stage-docs").upload(path, file);
    if (upErr) { setUploadingDoc(null); return; }
    const { data: urlData } = supabase.storage.from("stage-docs").getPublicUrl(path);
    const docType = docTypes[stageId] ?? "other";
    const docName = docNames[stageId] || file.name;
    const { data, error } = await supabase.from("stage_documents").insert({
      project_stage_id: stageId,
      file_url: urlData.publicUrl,
      document_type: docType,
      name: docName,
    }).select("*").single();
    if (!error && data) {
      setDocuments((prev) => ({ ...prev, [stageId]: [...(prev[stageId] ?? []), data as StageDocument] }));
      setDocNames((prev) => ({ ...prev, [stageId]: "" }));
    }
    if (docInputRefs.current[stageId]) docInputRefs.current[stageId]!.value = "";
    setUploadingDoc(null);
  }

  return (
    <div className="space-y-4">
      {/* Progress summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Overall Progress</h2>
          <span className="text-sm text-gray-500">{completedCount}/{masterStages.length} stages complete</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
          <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-500">
          <span className="text-green-600 font-medium">{completedCount} complete</span>
          <span className="text-blue-600 font-medium">{inProgressCount} in progress</span>
          <span className="text-gray-400">{masterStages.length - totalActivated} not activated</span>
        </div>
      </div>

      {/* Stage list */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {masterStages.map((master) => {
          const ps = stageMap.get(master.stage_number);
          const status: StageStatus = ps?.status ?? "not_started";
          const cfg = statusConfig[status];
          const isExpanded = expanded.has(master.stage_number);
          const edits = editValues[master.stage_number] ?? {};
          const isSaving = saving === master.stage_number;
          const stageId = ps?.id ?? "";
          const stagePhotos = photos[stageId] ?? [];
          const stageDocs = documents[stageId] ?? [];

          return (
            <div key={master.stage_number}>
              {/* Row */}
              <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${cfg.bg}`}
                onClick={() => ps && toggleExpanded(master.stage_number)}>
                <div className={`shrink-0 ${cfg.color}`}>{cfg.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-400 shrink-0">{String(master.stage_number).padStart(2, "0")}</span>
                    <span className={`text-sm font-medium ${ps ? "text-gray-900" : "text-gray-400"}`}>{master.name}</span>
                  </div>
                  {ps && (ps.planned_start || ps.actual_start) && (
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      {ps.planned_start && <span>Planned: {fmtDate(ps.planned_start)} → {fmtDate(ps.planned_end)}</span>}
                      {ps.actual_start && <span className="text-blue-500">Started: {fmtDate(ps.actual_start)}</span>}
                      {ps.actual_end && <span className="text-green-500">Done: {fmtDate(ps.actual_end)}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!ps ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); activateStage(master.stage_number); }}
                      disabled={isSaving}
                      className="text-xs text-gray-400 hover:text-amber-600 border border-gray-200 hover:border-amber-400 px-2 py-1 rounded-lg transition-colors"
                    >
                      {isSaving ? "Adding…" : <><Plus size={12} className="inline" /> Activate</>}
                    </button>
                  ) : (
                    <>
                      {status === "not_started" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(ps, "in_progress"); }}
                          disabled={isSaving}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 border border-blue-300 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Clock size={13} />
                          {isSaving ? "Saving…" : "Started"}
                        </button>
                      )}
                      {status !== "completed" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(ps, "completed"); }}
                          disabled={isSaving}
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-600 border border-green-300 hover:bg-green-50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 size={13} />
                          {isSaving ? "Saving…" : "Complete"}
                        </button>
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>{cfg.label}</span>
                      {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {ps && isExpanded && (
                <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                  {/* Status buttons */}
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {(["not_started", "in_progress", "completed", "blocked"] as StageStatus[]).map((s) => (
                      <button key={s} onClick={() => updateStatus(ps, s)} disabled={isSaving}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                          status === s
                            ? `${statusConfig[s].bg} ${statusConfig[s].color} border-current border-opacity-30`
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}>
                        {statusConfig[s].icon}
                        {statusConfig[s].label}
                      </button>
                    ))}
                  </div>

                  {/* Date fields */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    {[
                      { key: "planned_start", label: "Planned Start" },
                      { key: "planned_end", label: "Planned End" },
                      { key: "actual_start", label: "Actual Start" },
                      { key: "actual_end", label: "Actual End" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-xs text-gray-400 mb-1">{label}</label>
                        <input type="date"
                          value={edits[key as keyof ProjectStage] as string ?? ps[key as keyof ProjectStage] as string ?? ""}
                          onChange={(e) => setEdit(master.stage_number, key, e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  <div className="mb-3">
                    <label className="block text-xs text-gray-400 mb-1">Notes</label>
                    <textarea
                      value={edits.notes as string ?? ps.notes ?? ""}
                      onChange={(e) => setEdit(master.stage_number, "notes", e.target.value)}
                      rows={2}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] resize-none" />
                  </div>

                  {Object.keys(edits).length > 0 && (
                    <button onClick={() => saveDetails(ps)} disabled={isSaving}
                      className="inline-flex items-center gap-1.5 text-xs bg-amber-500 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors font-medium mb-4">
                      <Check size={12} /> {isSaving ? "Saving…" : "Save Changes"}
                    </button>
                  )}

                  {/* Photos section */}
                  <div className="border-t border-gray-200 pt-4 mt-2 mb-3">
                    <div className="flex items-center gap-2 mb-3">
                      <Image size={14} className="text-amber-600" />
                      <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Photos</h4>
                    </div>

                    {stagePhotos.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                        {stagePhotos.map((photo) => (
                          <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.file_url}
                              alt={photo.caption ?? "Stage photo"}
                              className="w-full h-full object-cover"
                            />
                            {photo.caption && (
                              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1.5 py-1 truncate">
                                {photo.caption}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 items-start flex-wrap">
                      <input
                        type="text"
                        placeholder="Caption (optional)"
                        value={photoCaptions[stageId] ?? ""}
                        onChange={(e) => setPhotoCaptions((p) => ({ ...p, [stageId]: e.target.value }))}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
                      />
                      <label className={`inline-flex items-center gap-1.5 text-xs border border-amber-400 text-amber-600 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 cursor-pointer transition-colors ${uploadingPhoto === stageId ? "opacity-50 pointer-events-none" : ""}`}>
                        <Upload size={12} />
                        {uploadingPhoto === stageId ? "Uploading…" : "Add Photo"}
                        <input
                          ref={(el) => { photoInputRefs.current[stageId] = el; }}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadPhoto(stageId, file);
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Documents section */}
                  <div className="border-t border-gray-200 pt-4 mt-2">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText size={14} className="text-amber-600" />
                      <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Documents</h4>
                    </div>

                    {stageDocs.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {stageDocs.map((doc) => (
                          <a
                            key={doc.id}
                            href={doc.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 text-xs text-amber-600 hover:text-amber-700 hover:underline"
                          >
                            <FileText size={12} />
                            <span className="truncate">{doc.name ?? "Document"}</span>
                            {doc.document_type && <span className="text-gray-400 capitalize shrink-0">({doc.document_type.replace("_", " ")})</span>}
                            <ExternalLink size={10} className="shrink-0" />
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 items-start flex-wrap">
                      <input
                        type="text"
                        placeholder="Document name"
                        value={docNames[stageId] ?? ""}
                        onChange={(e) => setDocNames((p) => ({ ...p, [stageId]: e.target.value }))}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
                      />
                      <select
                        value={docTypes[stageId] ?? "other"}
                        onChange={(e) => setDocTypes((p) => ({ ...p, [stageId]: e.target.value }))}
                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
                      >
                        <option value="inspection_report">Inspection Report</option>
                        <option value="permit">Permit</option>
                        <option value="approval">Approval</option>
                        <option value="other">Other</option>
                      </select>
                      <label className={`inline-flex items-center gap-1.5 text-xs border border-amber-400 text-amber-600 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 cursor-pointer transition-colors ${uploadingDoc === stageId ? "opacity-50 pointer-events-none" : ""}`}>
                        <Upload size={12} />
                        {uploadingDoc === stageId ? "Uploading…" : "Add Doc"}
                        <input
                          ref={(el) => { docInputRefs.current[stageId] = el; }}
                          type="file"
                          accept=".pdf,.doc,.docx"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadDocument(stageId, file);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
