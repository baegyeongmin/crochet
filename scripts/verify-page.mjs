/**
 * /patterns/new 가 실제로 분석 UI 를 렌더하는지 확인한다. dev 서버 필요.
 *   node scripts/verify-page.mjs
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const jar = new Map();
let failures = 0;

function save(res) {
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
}

async function call(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      ...(init.headers ?? {}),
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
  });
  save(res);
  return res;
}

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const email = `page-${Date.now()}@example.com`;
const password = "test-password-1234";

await call("/api/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});

const { csrfToken } = await (await call("/api/auth/csrf")).json();
await call("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken, email, password }),
});

const html = await (await call("/patterns/new")).text();

check("파일 입력이 있다", html.includes('type="file"') && html.includes('name="image"'));
check("분석 버튼이 있다", html.includes("이미지에서 도안 읽기"));
check("AI 다듬기 버튼이 있다", html.includes("AI로 문장 다듬기"));
check("도안 내용 textarea 가 있다", html.includes('name="content"'));
check("제목 입력이 있다", html.includes('name="title"'));
check("저장 버튼이 있다", html.includes("저장"));
check(
  "클라이언트 컴포넌트 번들이 실려 있다",
  /ChartParseField|_next\/static/.test(html),
);

console.log(`\n실패 ${failures}건`);
process.exit(failures > 0 ? 1 : 0);
