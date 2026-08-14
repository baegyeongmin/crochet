/**
 * crochet_rulepart(파이썬) 호출부. 도안 이미지 → 뜨개 텍스트.
 *
 * 파이썬 모듈은 상태가 없고 한 번 부르면 끝나므로 요청마다 프로세스를 띄운다.
 * crochet_rulepart/README.md 가 지정한 계약 그대로 쓴다:
 *   python crochet_rulepart/crochet.py <이미지> --json
 *   → stdout 에 JSON 만 나온다 (다른 출력은 섞이지 않는다)
 *
 * Node 런타임 전용이다. Edge 에서는 child_process 가 없으므로 이 모듈을 쓰는
 * 라우트는 반드시 nodejs 런타임이어야 한다.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** 파이썬 실행 파일. 로컬은 보통 .venv, 없으면 PATH 의 python. */
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python";

const SCRIPT = path.join(process.cwd(), "crochet_rulepart", "crochet.py");

const TIMEOUT_MS = 60_000;
/** stitches 배열이 크면 JSON 이 수백 KB 가 된다. 기본 1MB 로는 모자랄 수 있다. */
const MAX_BUFFER = 32 * 1024 * 1024;

export type ParsedRound = {
  n: number;
  text: string;
  count: number;
  warnings: string[];
  start_deg: number;
  source: string;
  confidence: number;
};

/** crochet.py parse_chart() 의 반환 형태. */
export type ChartResult = {
  text: string;
  rounds: ParsedRound[];
  stitches: unknown[];
  center: { x: number; y: number };
  confidence: number;
  warnings: string[];
};

/** 사용자에게 그대로 보여줄 수 있는 실패. */
export class ChartParseError extends Error {}

/**
 * 파이썬 트레이스백에서 사용자에게 보여줄 메시지를 건진다.
 *
 * detect/chart.py 는 원형 모티브가 아니거나 이진화가 실패하면 ValueError 를
 * 던지고, 메시지에 무엇을 확인해야 하는지 적어 둔다. README 가 "그 메시지를
 * 그대로 사용자에게 보여주라"고 지정한 건 오직 이 ValueError 다.
 *
 * 다른 예외(깨진 파일에 대한 PIL 의 OSError 등)는 내부 사정이므로 흘리지
 * 않는다. 원문은 서버 로그에만 남는다.
 */
function userMessage(stderr: string, tempPath: string): string | null {
  const lines = stderr.trimEnd().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const m = /^ValueError: (.+)$/.exec(lines[i].trim());
    if (!m) continue;
    // chart.py 는 메시지를 f"{path}: ..." 로 만든다. 그 path 는 우리가 만든
    // 임시 파일이라 사용자에게는 의미가 없고 서버 경로만 새어 나간다.
    return m[1].startsWith(`${tempPath}: `)
      ? m[1].slice(tempPath.length + 2)
      : m[1];
  }
  return null;
}

/** 파이썬이 남긴 stderr 를 서버 로그로만 남긴다 (경로 등이 섞여 있어서). */
function logFailure(scope: string, detail: unknown) {
  console.error(`[chart-parse] ${scope}:`, detail);
}

/**
 * 도안 이미지 한 장을 파싱한다.
 *
 * @param image 업로드된 이미지 바이트
 * @param filename 확장자를 살리기 위한 원본 파일명 (없으면 .png)
 * @throws ChartParseError 사용자에게 보여줄 수 있는 실패 (도안 인식 불가 등)
 */
export async function parseChart(
  image: Buffer,
  filename = "chart.png",
): Promise<ChartResult> {
  const dir = await mkdtemp(path.join(tmpdir(), "crochet-chart-"));
  const ext = path.extname(filename) || ".png";
  const target = path.join(dir, `chart${ext}`);

  try {
    await writeFile(target, image);

    let stdout: string;
    try {
      const result = await run(PYTHON_BIN, [SCRIPT, target, "--json"], {
        cwd: process.cwd(),
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        // 한국어가 섞인 JSON 을 stdout 으로 받는다. 윈도우의 기본 로케일
        // 인코딩(cp949)으로 나가면 Node 가 UTF-8 로 읽어 깨지므로 못 박는다.
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
        windowsHide: true,
      });
      stdout = result.stdout;
    } catch (err) {
      const e = err as NodeJS.ErrnoException & {
        stderr?: string;
        killed?: boolean;
        code?: string | number;
      };

      if (e.code === "ENOENT") {
        logFailure("python 실행 실패", `${PYTHON_BIN} 을 찾을 수 없다`);
        throw new ChartParseError(
          "도안 분석기(Python)를 실행할 수 없습니다. PYTHON_BIN 설정을 확인해주세요.",
        );
      }
      if (e.killed) {
        logFailure("시간 초과", `${TIMEOUT_MS}ms`);
        throw new ChartParseError(
          "도안 분석이 너무 오래 걸려 중단했습니다. 더 작은 이미지로 시도해주세요.",
        );
      }

      const stderr = e.stderr ?? "";
      logFailure("파이썬 오류", stderr || e.message);
      const msg = userMessage(stderr, target);
      throw new ChartParseError(
        msg ?? "도안을 분석하지 못했습니다. 원형 모티브 도안 이미지인지 확인해주세요.",
      );
    }

    try {
      return JSON.parse(stdout) as ChartResult;
    } catch {
      logFailure("JSON 파싱 실패", stdout.slice(0, 500));
      throw new ChartParseError("도안 분석 결과를 읽지 못했습니다.");
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
