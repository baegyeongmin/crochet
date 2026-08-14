"use client";

import { useState } from "react";

/** confidence 가 이 값 이하면 사람이 확인하는 게 좋다 (crochet_rulepart README). */
const LOW_CONFIDENCE = 0.5;

type ParseResponse = {
  text: string;
  warnings: string[];
  confidence: number;
  rounds: { n: number; count: number; source: string; confidence: number }[];
  stitchCount: number;
};

type Status = "idle" | "loading" | "done" | "error";

/**
 * 도안 이미지 업로드 + 자동 분석 + 결과 편집.
 *
 * 이미지 input 과 content textarea 를 한 덩어리로 들고 있다. 분석 결과를
 * textarea 에 채워 넣어야 해서 클라이언트 상태가 필요하다. 폼 자체는 상위
 * 서버 액션이 그대로 처리하므로 name 속성(image/content)은 유지한다.
 */
export function ChartParseField() {
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);

  async function parse() {
    if (!file) return;

    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch("/api/patterns/parse", { method: "POST", body });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setError(typeof data.error === "string" ? data.error : "분석에 실패했습니다.");
        return;
      }

      const parsed = data as ParseResponse;
      setResult(parsed);
      setContent(parsed.text);
      setStatus("done");
    } catch {
      setStatus("error");
      setError("서버와 통신하지 못했습니다.");
    }
  }

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">도안 이미지 (선택)</span>
        <input
          type="file"
          name="image"
          accept="image/*"
          className="border rounded px-3 py-2 text-sm"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus("idle");
            setError(null);
            setResult(null);
          }}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={parse}
          disabled={!file || status === "loading"}
          className="border rounded px-3 py-2 text-sm disabled:opacity-40"
        >
          {status === "loading" ? "분석 중…" : "이미지에서 도안 읽기"}
        </button>
        {!file && (
          <span className="text-xs text-gray-400">
            이미지를 선택하면 자동으로 읽어볼 수 있어요.
          </span>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {result && (
        <div className="border rounded px-3 py-2 text-sm bg-gray-50 flex flex-col gap-1">
          <p>
            {result.rounds.length}단 · 기호 {result.stitchCount}개 · 확신도{" "}
            {result.confidence.toFixed(2)}
          </p>
          {result.confidence <= LOW_CONFIDENCE && (
            <p className="text-amber-700">
              확신도가 낮아요. 아래 내용을 직접 확인하고 고쳐주세요.
            </p>
          )}
          {result.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-amber-700">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <textarea
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="도안 내용 (예: 1단: 사슬 6, 짧은뜨기 5...)"
        required
        rows={12}
        className="border rounded px-3 py-2 font-mono text-sm"
      />
    </>
  );
}
