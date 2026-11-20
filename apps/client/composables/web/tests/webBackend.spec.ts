import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { idbDel, idbDelByPrefix } from "../idb";
import { route } from "../webBackend";

/**
 * 浏览器端后端（webBackend.route）的集成测试。
 * 不依赖浏览器/真实 IndexedDB：
 *   - 内容层（content）用一个小数据集 mock 掉（真实版是 4.3MB 的 courses.json）
 *   - 状态层（idb）走 fake-indexeddb，真实 KV 逻辑
 * 目标是验证每个 API 路径返回的形状正确、读写落到 IndexedDB。
 */

const { FAKE_DATA } = vi.hoisted(() => {
  const FAKE_DATA = {
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    packs: [
      {
        id: "pack-1",
        order: 1,
        title: "包一",
        description: "简介",
        isFree: true,
        cover: "",
        shareLevel: "public",
        courses: [
          {
            id: "course-1",
            title: "Sentence 01",
            description: "",
            video: "",
            order: 1,
            coursePackId: "pack-1",
            statementCount: 2,
            statements: [
              {
                id: "s1",
                order: 1,
                english: "I like cats.",
                chinese: "我喜欢猫。",
                soundmark: "",
                courseId: "course-1",
                isMastered: false,
                analysis: null,
                splitTree: null,
              },
              {
                id: "s2",
                order: 2,
                english: "Dogs are friendly.",
                chinese: "狗很友好。",
                soundmark: "",
                courseId: "course-1",
                isMastered: false,
                analysis: null,
                splitTree: null,
              },
            ],
          },
        ],
      },
    ],
  };
  return { FAKE_DATA };
});

vi.mock("../content", () => {
  const find = <T extends { id: string }>(arr: T[], id: string) => arr.find((x) => x.id === id);
  return {
    loadWebData: vi.fn(async () => FAKE_DATA),
    getPack: vi.fn(async (id: string) => find(FAKE_DATA.packs, id)),
    getCourse: vi.fn(async (pid: string, cid: string) =>
      find(find(FAKE_DATA.packs, pid)?.courses ?? [], cid),
    ),
    getStatement: vi.fn(async (sid: string) => {
      for (const p of FAKE_DATA.packs)
        for (const c of p.courses)
          for (const s of c.statements) if (s.id === sid) return { course: c, statement: s };
      return undefined;
    }),
  };
});

/** 构造一次 API 调用并解析 JSON 响应 */
async function call(
  method: string,
  path: string,
  opts?: { body?: any; query?: Record<string, string> },
) {
  const qs = opts?.query ? `?${new URLSearchParams(opts.query).toString()}` : "";
  const url = new URL(`http://localhost${path}${qs}`);
  const res = await route(url, method, opts?.body ?? {});
  return { status: res.status, data: await res.json() };
}

beforeEach(async () => {
  // 每个用例清空 IndexedDB，避免互相污染
  for (const prefix of [
    "progress:",
    "last-practice:",
    "route:",
    "lp:",
    "mastered:",
    "session:",
    "learning-time:",
    "practice-state:",
  ]) {
    await idbDelByPrefix(prefix);
  }
  await idbDel("review-settings");
  await idbDel("learning-path-config");
});

describe("webBackend.route", () => {
  it("GET /course-pack 返回课程包列表（元信息）", async () => {
    const { status, data } = await call("GET", "/course-pack");
    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ id: "pack-1", title: "包一", isFree: true });
  });

  it("GET /course-pack/:id 返回包 + 课程（带进度，句子不内联）", async () => {
    const { data } = await call("GET", "/course-pack/pack-1");
    expect(data.id).toBe("pack-1");
    expect(data.courses).toHaveLength(1);
    expect(data.courses[0]).toMatchObject({
      id: "course-1",
      statementCount: 2,
      learnedCount: 0,
      completionCount: 0,
    });
    expect(data.courses[0].statements).toBeUndefined();
  });

  it("GET 单课内联句子并带断点下标", async () => {
    const { data } = await call("GET", "/course-pack/pack-1/courses/course-1");
    expect(data.statements).toHaveLength(2);
    expect(data.statementIndex).toBe(0);
  });

  it("PUT 课程进度 → 读回断点，进度条 learnedCount 跟着走", async () => {
    await call("PUT", "/user-course-progress", {
      body: { coursePackId: "pack-1", courseId: "course-1", statementIndex: 1 },
    });
    const course = await call("GET", "/course-pack/pack-1/courses/course-1");
    expect(course.data.statementIndex).toBe(1);
    const pack = await call("GET", "/course-pack/pack-1");
    expect(pack.data.courses[0].learnedCount).toBe(1);
  });

  it("POST /complete 标记完成 → 最近课程包出现该包", async () => {
    await call("POST", "/course-pack/pack-1/courses/course-1/complete");
    const recent = await call("GET", "/user-course-progress/recent-course-packs");
    expect(recent.data).toHaveLength(1);
    expect(recent.data[0]).toMatchObject({
      coursePackId: "pack-1",
      courseId: "course-1",
      title: "包一",
    });
  });

  it("GET /user 返回非会员", async () => {
    const { data } = await call("GET", "/user");
    expect(data).toEqual({ membership: { isMember: false, details: null } });
  });

  it("复习 / 排行 / 学习路径 返回可优雅降级的默认值", async () => {
    expect((await call("GET", "/review/overview")).data).toEqual([]);
    expect((await call("GET", "/review/pack-1/summary")).data).toEqual({
      total: 0,
      due: 0,
      graduated: 0,
      learning: 0,
    });
    const config = (await call("GET", "/learning-path/pack-1/config")).data;
    expect(config.nodeOrder).toBe("mode_first");
    expect(config.modes).toContain("chinese_to_english");
    const rank = (await call("GET", "/rank/progress/weekly")).data;
    expect(rank.list).toEqual([]);
  });

  it("收藏本 写→读→删", async () => {
    const added = await call("POST", "/mastered-elements", {
      body: { content: { english: "cat" } },
    });
    expect(added.data.id).toMatch(/^mastered:/);
    const list = await call("GET", "/mastered-elements");
    expect(list.data).toHaveLength(1);
    const removed = await call("DELETE", `/mastered-elements/${added.data.id}`);
    expect(removed.data).toBe(true);
    expect((await call("GET", "/mastered-elements")).data).toHaveLength(0);
  });

  it("practice-state 断点 写→读", async () => {
    await call("PUT", "/practice-state", {
      body: {
        coursePackId: "pack-1",
        courseId: "course-1",
        practiceMode: "chinese_to_english",
        splitMode: "word_first",
        stagesKey: "k",
        statementIndex: 3,
      },
    });
    const read = await call("GET", "/practice-state", {
      query: {
        coursePackId: "pack-1",
        courseId: "course-1",
        practiceMode: "chinese_to_english",
        splitMode: "word_first",
        stagesKey: "k",
      },
    });
    expect(read.data.statementIndex).toBe(3);
  });

  it("TTS 路径 404（前端走有道/浏览器兜底）", async () => {
    const { status } = await call("GET", "/tts/speak");
    expect(status).toBe(404);
  });

  it("translate 返回空译文（无后端）", async () => {
    const { data } = await call("POST", "/translate", { body: { texts: ["hello"] } });
    expect(data.translations).toEqual({ hello: "" });
  });
});
