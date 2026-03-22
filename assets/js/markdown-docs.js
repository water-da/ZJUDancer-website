document.addEventListener("DOMContentLoaded", function () {
  const navContainer = document.getElementById("doc-nav");
  const content = document.getElementById("markdown-content");

  // 根据页面选择导航配置
  const pageType = document.body.dataset.page; 
  const NAV_CONFIG = pageType === "tutorials" ? TUTORIALS_NAV : DOCUMENTS_NAV;

  function createNavTree(items, level = 0) {
    const ul = document.createElement("ul");
    ul.className = `doc-nav-level doc-nav-level-${level}`;

    items.forEach(item => {
      const li = document.createElement("li");
      li.className = "doc-nav-item";

      // 情况1：这是一个分类节点
      if (item.children && item.children.length > 0) {
        li.classList.add("has-children");

        const button = document.createElement("button");
        button.className = "doc-nav-toggle";
        button.type = "button";
        button.innerHTML = `
          <span class="doc-nav-arrow">▸</span>
          <span class="doc-nav-title">${item.title}</span>
        `;

        button.addEventListener("click", function () {
          li.classList.toggle("open");
        });

        li.appendChild(button);
        li.appendChild(createNavTree(item.children, level + 1));
      }
      // 情况2：这是一个文档叶子节点
      else if (item.file) {
        const link = document.createElement("a");
        link.href = `?doc=${encodeURIComponent(item.docId || "")}`;
        link.className = "doc-nav-link";
        link.textContent = item.title;
        link.dataset.md = item.file;
        link.dataset.docId = item.docId || "";

        link.addEventListener("click", function (e) {
          e.preventDefault();
          loadMarkdown(item.file, item.docId, link);
        });

        li.appendChild(link);
      }

      ul.appendChild(li);
    });

    return ul;
  }

  async function loadMarkdown(path, docId, clickedLink = null) {
    try {
      content.innerHTML = "<p>Loading...</p>";

      const response = await fetch(path);
      if (!response.ok) throw new Error("Failed to load markdown file.");

      const mdText = await response.text();
      content.innerHTML = marked.parse(mdText);

      highlightActiveLink(docId);

      const url = new URL(window.location);
      if (docId) {
        url.searchParams.set("doc", docId);
      }
      history.replaceState(null, "", url);

      // 如有代码高亮库，可以在这里执行
      if (window.hljs) {
        document.querySelectorAll("pre code").forEach((el) => {
          hljs.highlightElement(el);
        });
      }
    } catch (error) {
      content.innerHTML = `
        <h2>Error</h2>
        <p>Unable to load document: ${path}</p>
        <pre>${error.message}</pre>
      `;
    }
  }

  function highlightActiveLink(docId) {
    document.querySelectorAll(".doc-nav-link").forEach(link => {
      link.classList.remove("active");
      if (link.dataset.docId === docId) {
        link.classList.add("active");
        expandParents(link);
      }
    });
  }

  function expandParents(element) {
    let parent = element.parentElement;
    while (parent && parent !== navContainer) {
      if (parent.classList.contains("has-children")) {
        parent.classList.add("open");
      }
      parent = parent.parentElement;
    }
  }

  function findFirstLeaf(items) {
    for (const item of items) {
      if (item.file) return item;
      if (item.children) {
        const childLeaf = findFirstLeaf(item.children);
        if (childLeaf) return childLeaf;
      }
    }
    return null;
  }

  function findItemByDocId(items, docId) {
    for (const item of items) {
      if (item.docId === docId) return item;
      if (item.children) {
        const found = findItemByDocId(item.children, docId);
        if (found) return found;
      }
    }
    return null;
  }

  // 渲染导航
  navContainer.innerHTML = "";
  navContainer.appendChild(createNavTree(NAV_CONFIG));

  // 根据 URL 参数决定加载哪篇文档
  const params = new URLSearchParams(window.location.search);
  const currentDocId = params.get("doc");

  let targetItem = null;
  if (currentDocId) {
    targetItem = findItemByDocId(NAV_CONFIG, currentDocId);
  }

  if (!targetItem) {
    targetItem = findFirstLeaf(NAV_CONFIG);
  }

  if (targetItem) {
    loadMarkdown(targetItem.file, targetItem.docId);
  }
});
