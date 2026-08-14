import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanup, keepsNumbers } from "./polish.ts";

const RAW = "1단: 사슬 3(=한길긴뜨기 1코), 한길긴뜨기 14, 빼뜨기로 마무리 (15코)";

test("말투만 바뀐 결과는 통과한다", () => {
  const polished =
    "1단: 사슬 3코(한길긴뜨기 1코를 대신해요), 한길긴뜨기 14코, 빼뜨기로 마무리 (15코)";
  assert.equal(keepsNumbers(RAW, polished), true);
});

test("총 코 수가 바뀌면 막는다", () => {
  const polished = "1단: 사슬 3(=한길긴뜨기 1코), 한길긴뜨기 14, 빼뜨기로 마무리 (16코)";
  assert.equal(keepsNumbers(RAW, polished), false);
});

test("단 번호가 바뀌면 막는다", () => {
  const polished = "2단: 사슬 3(=한길긴뜨기 1코), 한길긴뜨기 14, 빼뜨기로 마무리 (15코)";
  assert.equal(keepsNumbers(RAW, polished), false);
});

test("단을 지어내면 막는다", () => {
  const polished = `${RAW}\n2단: 짧은뜨기 30, 빼뜨기로 마무리 (30코)`;
  assert.equal(keepsNumbers(RAW, polished), false);
});

test("단을 빠뜨리면 막는다", () => {
  const two = `${RAW}\n2단: 짧은뜨기 30, 빼뜨기로 마무리 (30코)`;
  assert.equal(keepsNumbers(two, RAW), false);
});

test("총 코 수 표기를 없애면 막는다", () => {
  const polished = "1단: 사슬 3(=한길긴뜨기 1코), 한길긴뜨기 14, 빼뜨기로 마무리";
  assert.equal(keepsNumbers(RAW, polished), false);
});

test("괄호 안 공백은 허용한다", () => {
  const polished = "1단: 사슬 3(=한길긴뜨기 1코), 한길긴뜨기 14, 빼뜨기로 마무리 ( 15 코 )";
  assert.equal(keepsNumbers(RAW, polished), true);
});

test("경고 줄을 고치면 막는다", () => {
  const withWarn = `${RAW}\n  ⚠ 시작점 확신도 0.5 — 기둥사슬 후보가 애매했다`;
  const polished = `${RAW}\n  ⚠ 시작점이 조금 애매했어요`;
  assert.equal(keepsNumbers(withWarn, polished), false);
});

test("경고 줄을 지우면 막는다", () => {
  const withWarn = `${RAW}\n  ⚠ 시작점 확신도 0.5 — 기둥사슬 후보가 애매했다`;
  assert.equal(keepsNumbers(withWarn, RAW), false);
});

test("경고 줄을 그대로 옮기면 통과한다", () => {
  const warn = "  ⚠ 시작점 확신도 0.5 — 기둥사슬 후보가 애매했다";
  const withWarn = `${RAW}\n${warn}`;
  const polished = `1단: 사슬 3코(한길긴뜨기 1코 대신), 한길긴뜨기 14코, 빼뜨기로 마무리 (15코)\n${warn}`;
  assert.equal(keepsNumbers(withWarn, polished), true);
});

test("cleanup 은 코드블록 울타리를 걷어낸다", () => {
  assert.equal(cleanup("```\n" + RAW + "\n```"), RAW);
  assert.equal(cleanup("```text\n" + RAW + "\n```"), RAW);
  assert.equal(cleanup(`  ${RAW}  `), RAW);
  assert.equal(cleanup(RAW), RAW);
});
