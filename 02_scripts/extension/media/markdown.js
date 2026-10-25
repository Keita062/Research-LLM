/* AI 回答の簡易 Markdown 表示（HTML はすべてエスケープしてから整形する） */
(function () {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) =>
    esc(s)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  window.renderMd = function (src) {
    return src
      .split(/^```[^\n]*\n?/m)
      .map((p, i) => (i % 2 === 1 ? `<pre><code>${esc(p.replace(/\n$/, ""))}</code></pre>` : inline(p)))
      .join("");
  };
})();
