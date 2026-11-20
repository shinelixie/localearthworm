/**
 * 纯前端（GitHub Pages）构建的冒烟测试：
 * 对静态服务器上的 .output/public 做端到端验证（web 模式 + hash 路由 + IndexedDB）。
 * 需要先起静态服务（见 tools 说明），这里直接用绝对 URL 访问。
 */
const BASE = "http://127.0.0.1:4190/localearthworm/";

describe("web static build", () => {
  it("首页渲染课程包列表（数据来自 courses.json）", () => {
    cy.visit(`${BASE}#/`, { timeout: 20000 });
    // 5 个课程包卡片
    cy.get(".course-pack-card").should("have.length.gte", 5, { timeout: 15000 });
  });

  it("hash 路由下刷新不 404（静态服务器只认根路径）", () => {
    cy.visit(`${BASE}#/`, { timeout: 20000 });
    cy.get(".course-pack-card").should("have.length.gte", 5, { timeout: 15000 });
    // 直接「刷新」深链：静态服务器返回的仍是 index.html，SPA 从 hash 恢复
    cy.reload();
    cy.get(".course-pack-card").should("have.length.gte", 5, { timeout: 15000 });
  });

  it("课程包详情走浏览器端后端（进度读 IndexedDB）", () => {
    cy.visit(`${BASE}#/`, { timeout: 20000 });
    cy.get(".course-pack-card").first().click();
    // 详情页有课程列表
    cy.url().should("include", "#/course-pack/");
    cy.get("body").should("contain.text", "Sentence", { timeout: 15000 });
  });
});
