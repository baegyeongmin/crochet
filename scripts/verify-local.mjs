/**
 * 로컬 종단간 점검. dev 서버가 http://localhost:3000 에 떠 있어야 한다.
 *
 *   node scripts/verify-local.mjs
 *
 * 회원가입 → 로그인 → 도안 이미지 분석 → 도안 저장 → 조회까지 실제 HTTP 로 훑고
 * 각 단계의 성공/실패를 찍는다. 종료 코드가 0 이면 전부 통과.
 */

import { readFile } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHART = "crochet_rulepart/data/sample.png";
const EXPECTED_TEXT =
  "1단: 사슬 3(=한길긴뜨기 1코), 한길긴뜨기 14, 빼뜨기로 마무리 (15코)";

const jar = new Map();
let failures = 0;

function saveCookies(res) {
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "" ) jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader() {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers ?? {}), cookie: cookieHeader() },
  });
  saveCookies(res);
  return res;
}

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
  return ok;
}

const email = `verify-${Date.now()}@example.com`;
const password = "test-password-1234";

// 1. 회원가입
{
  const res = await call("/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  check("회원가입", res.ok, `HTTP ${res.status}`);
}

// 2. 잘못된 JSON 을 보냈을 때의 응답 (400 이어야 하는데 현재는 500)
{
  const res = await call("/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ this is not json",
  });
  check(
    "깨진 JSON 은 400 을 준다",
    res.status === 400,
    `HTTP ${res.status} (500 이면 request.json() 무방비)`,
  );
}

// 3. 로그인 (NextAuth credentials: csrf 토큰 먼저)
{
  const csrfRes = await call("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();

  const body = new URLSearchParams({ csrfToken, email, password });
  const res = await call("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const authed = [...jar.keys()].some((k) => k.includes("session-token"));
  check("로그인 (세션 쿠키 발급)", authed, `HTTP ${res.status}`);
}

// 4. 대소문자가 다른 이메일로 로그인 — signup 은 소문자로 저장하는데
//    authorize() 는 입력을 그대로 조회한다.
{
  const saved = new Map(jar);
  jar.clear();
  const csrfRes = await call("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  await call("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      email: email.toUpperCase(),
      password,
    }),
  });
  const authed = [...jar.keys()].some((k) => k.includes("session-token"));
  check("대문자 이메일로도 로그인된다", authed, authed ? "" : "이메일 정규화 불일치");
  jar.clear();
  for (const [k, v] of saved) jar.set(k, v);
}

// 5. 인증 없이 분석 요청은 401
{
  const saved = new Map(jar);
  jar.clear();
  const form = new FormData();
  form.append("image", new Blob([await readFile(CHART)], { type: "image/png" }), "sample.png");
  const res = await call("/api/patterns/parse", { method: "POST", body: form });
  check("비로그인 분석 요청은 401", res.status === 401, `HTTP ${res.status}`);
  jar.clear();
  for (const [k, v] of saved) jar.set(k, v);
}

// 6. 도안 이미지 분석 — 이 프로젝트의 핵심 경로
let parsedText = null;
{
  const form = new FormData();
  form.append("image", new Blob([await readFile(CHART)], { type: "image/png" }), "sample.png");

  const started = Date.now();
  const res = await call("/api/patterns/parse", { method: "POST", body: form });
  const ms = Date.now() - started;
  const data = await res.json();

  if (check("도안 분석 요청 성공", res.ok, `HTTP ${res.status} ${ms}ms ${JSON.stringify(data).slice(0, 200)}`)) {
    parsedText = data.text;
    check("분석 결과가 기대한 뜨개 텍스트와 일치", data.text === EXPECTED_TEXT, JSON.stringify(data.text));
    check("한글이 깨지지 않는다", /사슬|한길긴뜨기/.test(data.text ?? ""), "인코딩 확인");
    check("경고 없음", Array.isArray(data.warnings) && data.warnings.length === 0, JSON.stringify(data.warnings));
    check("확신도 1.0", data.confidence === 1.0, String(data.confidence));
    check("기호 18개 검출 (사슬 3 + dc 14 + 빼뜨기 1)", data.stitchCount === 18, String(data.stitchCount));
  }
}

// 7. 도안이 아닌 이미지 → 사용자에게 보여줄 한국어 메시지로 422
{
  const form = new FormData();
  form.append(
    "image",
    new Blob([await readFile("crochet_rulepart/data/not-a-chart.png")], { type: "image/png" }),
    "not-a-chart.png",
  );
  const res = await call("/api/patterns/parse", { method: "POST", body: form });
  const data = await res.json();
  check("도안이 아니면 422", res.status === 422, `HTTP ${res.status}`);
  check(
    "실패 메시지가 파이썬의 한국어 안내",
    typeof data.error === "string" && data.error.includes("중심 고리"),
    JSON.stringify(data.error),
  );
  check(
    "실패 메시지에 서버 경로가 안 새어 나온다",
    typeof data.error === "string" && !/[/\\]|[A-Za-z]:/.test(data.error),
    JSON.stringify(data.error),
  );
}

// 7b. 깨진 이미지 파일 → PIL 내부 메시지가 아니라 일반 안내
{
  const form = new FormData();
  form.append(
    "image",
    new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAK", "base64")], { type: "image/png" }),
    "broken.png",
  );
  const res = await call("/api/patterns/parse", { method: "POST", body: form });
  const data = await res.json();
  check(
    "깨진 이미지는 내부 오류 메시지를 노출하지 않는다",
    res.status === 422 && !/data stream|Traceback|PIL/i.test(data.error ?? ""),
    `HTTP ${res.status} ${JSON.stringify(data.error)}`,
  );
}

// 8. 이미지가 아닌 파일은 400
{
  const form = new FormData();
  form.append("image", new Blob(["not an image"], { type: "text/plain" }), "a.txt");
  const res = await call("/api/patterns/parse", { method: "POST", body: form });
  check("이미지가 아니면 400", res.status === 400, `HTTP ${res.status}`);
}

// 9. 분석 결과로 도안 저장 → 목록/상세 확인
if (parsedText) {
  const res = await call("/api/patterns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "합성 도안 점검", content: parsedText }),
  });
  const data = await res.json();
  if (check("도안 저장", res.status === 201, `HTTP ${res.status}`)) {
    const id = data.pattern.id;
    const one = await call(`/api/patterns/${id}`);
    const got = await one.json();
    check("저장한 도안 조회", one.ok && got.pattern.content === parsedText, `HTTP ${one.status}`);

    const list = await call("/api/patterns");
    const listed = await list.json();
    check("목록에 나온다", list.ok && listed.patterns.some((p) => p.id === id), `HTTP ${list.status}`);

    const del = await call(`/api/patterns/${id}`, { method: "DELETE" });
    check("삭제", del.ok, `HTTP ${del.status}`);
  }
}

// 10. 도안 수정 경로가 있는가 (없다 — PUT/PATCH 미구현)
{
  const res = await call("/api/patterns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "수정 점검", content: "1단: 사슬 6" }),
  });
  const { pattern } = await res.json();
  const put = await call(`/api/patterns/${pattern.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "고침", content: "1단: 사슬 7" }),
  });
  check("도안 수정(PUT) 가능", put.ok, `HTTP ${put.status} (405 면 미구현)`);
  await call(`/api/patterns/${pattern.id}`, { method: "DELETE" });
}

// 11. 페이지가 렌더되는가
for (const path of ["/", "/login", "/signup", "/patterns", "/patterns/new"]) {
  const res = await call(path);
  check(`페이지 ${path}`, res.ok, `HTTP ${res.status}`);
}

console.log(`\n실패 ${failures}건`);
process.exit(failures > 0 ? 1 : 0);
