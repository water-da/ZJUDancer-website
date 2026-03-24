document.addEventListener("DOMContentLoaded", function () {
  const pageType = document.body.dataset.page;
  const navRoot = document.getElementById("doc-nav");
  const contentRoot = document.getElementById("doc-content");
  const tocRoot = document.getElementById("doc-toc-list");
  const tocContainer = document.querySelector(".doc-toc");

  const NAV_DATA = pageType === "documents" ? DOCUMENTS_NAV : TUTORIALS_NAV;

  function getFileType(file) {
    if (!file) return "";
    return file.split(".").pop().toLowerCase();
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, "")
      .replace(/\s+/g, "-");
  }

  function assignHeadingIds(root) {
    const headings = root.querySelectorAll("h1, h2, h3, h4");
    const usedIds = new Map();

    headings.forEach((heading) => {
      const rawText = heading.textContent.trim();
      let baseId = slugify(rawText);

      if (!baseId) {
        baseId = "section";
      }

      const count = usedIds.get(baseId) || 0;
      usedIds.set(baseId, count + 1);

      const finalId = count === 0 ? baseId : `${baseId}-${count}`;
      heading.id = finalId;
    });
  }

  function buildTOC(root) {
    if (!tocRoot || !tocContainer) return;

    tocRoot.innerHTML = "";

    const headings = root.querySelectorAll("h1, h2, h3, h4");

    if (!headings.length) {
      tocContainer.style.display = "none";
      return;
    }

    tocContainer.style.display = "";

    headings.forEach((heading) => {
      const level = Number(heading.tagName.charAt(1));
      const link = document.createElement("a");

      link.href = `#${heading.id}`;
      link.className = `toc-link toc-level-${level}`;
      link.textContent = heading.textContent.trim();

      link.addEventListener("click", function (e) {
        e.preventDefault();

        const target = document.getElementById(heading.id);
        if (!target) return;

        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        history.replaceState(
          null,
          "",
          `?doc=${encodeURIComponent(new URLSearchParams(window.location.search).get("doc") || "")}#${heading.id}`
        );
      });

      tocRoot.appendChild(link);
    });
  }

  function hideTOC() {
    if (!tocContainer) return;
    tocContainer.style.display = "none";
    if (tocRoot) tocRoot.innerHTML = "";
  }

  async function renderMermaidInContent(root) {
    if (!window.mermaid) {
      console.warn("Mermaid is not loaded.");
      return;
    }

    const mermaidBlocks = root.querySelectorAll("pre code.language-mermaid");

    for (let i = 0; i < mermaidBlocks.length; i++) {
      const codeBlock = mermaidBlocks[i];
      const pre = codeBlock.parentElement;
      const graphDefinition = codeBlock.textContent.trim();
      const renderId = `mermaid-${Date.now()}-${i}`;

      try {
        const { svg } = await window.mermaid.render(renderId, graphDefinition);

        const wrapper = document.createElement("div");
        wrapper.className = "mermaid-wrapper";

        wrapper.innerHTML = `
          <div class="mermaid-toolbar">
            <button type="button" class="mermaid-zoom-btn" data-action="zoom-in">＋</button>
            <button type="button" class="mermaid-zoom-btn" data-action="zoom-out">－</button>
            <button type="button" class="mermaid-zoom-btn" data-action="reset">重置</button>
          </div>
          <div class="mermaid-viewport">
            <div class="mermaid-stage">
              ${svg}
            </div>
          </div>
        `;

        pre.replaceWith(wrapper);

        setupMermaidZoom(wrapper);
      } catch (error) {
        console.error("Mermaid render error:", error);

        const errorBox = document.createElement("div");
        errorBox.className = "mermaid-error";
        errorBox.innerHTML = `
          <p><strong>Mermaid 渲染失败</strong></p>
          <pre>${graphDefinition}</pre>
        `;
        pre.replaceWith(errorBox);
      }
    }
  }

  async function renderMarkdown(file) {
    contentRoot.className = "doc-content markdown-body";
    contentRoot.innerHTML = "<p>Loading markdown...</p>";

    try {
      const response = await fetch(file);
      if (!response.ok) throw new Error("Failed to load markdown");

      const text = await response.text();
      contentRoot.innerHTML = marked.parse(text);

      assignHeadingIds(contentRoot);
      await renderMermaidInContent(contentRoot);
      buildTOC(contentRoot);
    } catch (error) {
      contentRoot.innerHTML = `<p>Failed to load document: ${error.message}</p>`;
      hideTOC();
    }
  }

  function renderPDF(file) {
    hideTOC();

    contentRoot.className = "doc-content";
    contentRoot.innerHTML = `
      <div class="doc-toolbar">
        <a href="${file}" target="_blank" class="button small">Open PDF in New Tab</a>
        <a href="${file}" download class="button small">Download PDF</a>
      </div>
      <iframe class="pdf-frame" src="${file}"></iframe>
    `;
  }

  function loadDocument(item) {
    if (!item || !item.file) return;

    const type = getFileType(item.file);

    if (type === "md") {
      renderMarkdown(item.file);
    } else if (type === "pdf") {
      renderPDF(item.file);
    } else {
      hideTOC();

      contentRoot.className = "doc-content";
      contentRoot.innerHTML = `
        <div class="doc-toolbar">
          <a href="${item.file}" target="_blank" class="button small">Open File</a>
          <a href="${item.file}" download class="button small">Download File</a>
        </div>
        <p>This file type is not previewable in the current page.</p>
      `;
    }

    if (item.docId) {
      history.replaceState(null, "", `?doc=${encodeURIComponent(item.docId)}`);
    }
  }

  function closeAllLinks() {
    document.querySelectorAll(".doc-link").forEach(el => {
      el.classList.remove("active");
    });
  }

  function openAncestorGroups(element) {
    let current = element.parentElement;
    while (current) {
      if (current.classList.contains("doc-subnav")) {
        current.classList.add("open");
      }

      if (current.classList.contains("doc-nav-item")) {
        const toggle = current.querySelector(":scope > .doc-nav-toggle");
        if (toggle) toggle.classList.add("open");
      }

      current = current.parentElement;
    }
  }

  function activateLink(link, item) {
    closeAllLinks();
    link.classList.add("active");
    loadDocument(item);
    openAncestorGroups(link);
  }

  function createNavNode(item, level = 0) {
    const wrapper = document.createElement("div");
    wrapper.className = `doc-nav-item level-${level}`;

    if (item.children && item.children.length > 0) {
      const toggle = document.createElement("button");
      toggle.className = "doc-nav-toggle";
      toggle.type = "button";
      toggle.textContent = item.title;

      const subList = document.createElement("div");
      subList.className = "doc-subnav";

      item.children.forEach(child => {
        subList.appendChild(createNavNode(child, level + 1));
      });

      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        const isOpen = subList.classList.contains("open");
        subList.classList.toggle("open", !isOpen);
        toggle.classList.toggle("open", !isOpen);
      });

      wrapper.appendChild(toggle);
      wrapper.appendChild(subList);
    } else if (item.file) {
      const link = document.createElement("button");
      link.className = "doc-link";
      link.type = "button";
      link.textContent = item.title;
      link.dataset.docId = item.docId || "";

      link.addEventListener("click", function (e) {
        e.stopPropagation();
        activateLink(link, item);
      });

      wrapper.appendChild(link);
    }

    return wrapper;
  }

  function findFirstDoc(items) {
    for (const item of items) {
      if (item.children && item.children.length > 0) {
        const found = findFirstDoc(item.children);
        if (found) return found;
      } else if (item.file) {
        return item;
      }
    }
    return null;
  }

  function findItemByDocId(items, docId) {
    for (const item of items) {
      if (item.children && item.children.length > 0) {
        const found = findItemByDocId(item.children, docId);
        if (found) return found;
      } else if (item.docId === docId) {
        return item;
      }
    }
    return null;
  }

  function findLinkByDocId(docId) {
    return document.querySelector(`.doc-link[data-doc-id="${docId}"]`);
  }

  NAV_DATA.forEach(item => {
    navRoot.appendChild(createNavNode(item, 0));
  });

  const params = new URLSearchParams(window.location.search);
  const targetDocId = params.get("doc");

  if (targetDocId) {
    const targetItem = findItemByDocId(NAV_DATA, targetDocId);
    const targetLink = findLinkByDocId(targetDocId);

    if (targetItem && targetLink) {
      targetLink.classList.add("active");
      loadDocument(targetItem);
      openAncestorGroups(targetLink);
      return;
    }
  }

  const defaultDoc = findFirstDoc(NAV_DATA);
  if (defaultDoc) {
    const defaultLink = findLinkByDocId(defaultDoc.docId);
    if (defaultLink) {
      defaultLink.classList.add("active");
      loadDocument(defaultDoc);
      openAncestorGroups(defaultLink);
    }
  }
});

function setupMermaidZoom(wrapper) {
  const stage = wrapper.querySelector(".mermaid-stage");
  const zoomInBtn = wrapper.querySelector('[data-action="zoom-in"]');
  const zoomOutBtn = wrapper.querySelector('[data-action="zoom-out"]');
  const resetBtn = wrapper.querySelector('[data-action="reset"]');

  let scale = 1;

  function applyTransform() {
    stage.style.transform = `scale(${scale})`;
  }

  zoomInBtn.addEventListener("click", () => {
    scale = Math.min(scale + 0.1, 3);
    applyTransform();
  });

  zoomOutBtn.addEventListener("click", () => {
    scale = Math.max(scale - 0.1, 0.4);
    applyTransform();
  });

  resetBtn.addEventListener("click", () => {
    scale = 1;
    applyTransform();
  });

  const viewport = wrapper.querySelector(".mermaid-viewport");
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();

      if (e.deltaY < 0) {
        scale = Math.min(scale + 0.1, 3);
      } else {
        scale = Math.max(scale - 0.1, 0.4);
      }

      applyTransform();
    },
    { passive: false }
  );

  applyTransform();
}
