"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addEvidenceAction, type ActionResult } from "../app/actions/escrow";

interface Props {
  disputeId: string;
  escrowId: string;
}

export function EvidenceUpload({ disputeId, escrowId }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [storageUri, setStorageUri] = useState("");
  const [fileSha256, setFileSha256] = useState("");
  const [fileType, setFileType] = useState("IMAGE");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const data = new FormData();
    data.set("disputeId", disputeId);
    data.set("escrowId", escrowId);
    data.set("source", "UPLOAD");
    data.set("fileType", fileType);
    data.set("storageUri", storageUri);
    data.set("fileSha256", fileSha256);
    data.set("fileName", fileName);
    const result: ActionResult = await addEvidenceAction(data);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "upload failed");
      return;
    }
    setNotice("Evidence recorded. Refreshing…");
    setFileName("");
    setStorageUri("");
    setFileSha256("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-dirt-700 bg-dirt-900/70 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-cream-100">Attach evidence</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-cream-300">
          File name
          <input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="scale-ticket-01.jpg"
            required
            className="mt-1 block w-full rounded-lg border border-dirt-600 bg-dirt-950 px-2.5 py-1.5 text-sm text-cream-100 focus:border-hay-400 focus:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-cream-300">
          Type
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-dirt-600 bg-dirt-950 px-2.5 py-1.5 text-sm text-cream-100"
          >
            <option value="IMAGE">Image</option>
            <option value="PDF">PDF</option>
            <option value="VIDEO">Video</option>
            <option value="JSON">JSON</option>
          </select>
        </label>
        <label className="text-xs font-medium text-cream-300 sm:col-span-2">
          Storage URI
          <input
            value={storageUri}
            onChange={(e) => setStorageUri(e.target.value)}
            placeholder="s3://evidence/esc-0001/scale-ticket-01.jpg"
            className="mt-1 block w-full rounded-lg border border-dirt-600 bg-dirt-950 px-2.5 py-1.5 text-sm text-cream-100 focus:border-hay-400 focus:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-cream-300 sm:col-span-2">
          SHA-256 (of the immutable file)
          <input
            value={fileSha256}
            onChange={(e) => setFileSha256(e.target.value)}
            placeholder="hex digest — demo: any 64-char hex string"
            className="mt-1 block w-full rounded-lg border border-dirt-600 bg-dirt-950 px-2.5 py-1.5 font-mono text-sm text-cream-100"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="btn-primary"
      >
        {pending ? "Recording…" : "Record evidence"}
      </button>
      {error && <p className="text-sm text-barn-200">{error}</p>}
      {notice && <p className="text-sm text-pasture-300">{notice}</p>}
    </form>
  );
}
