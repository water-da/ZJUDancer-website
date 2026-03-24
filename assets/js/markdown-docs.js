document.addEventListener("DOMContentLoaded", function () {
  const pageType = document.body.dataset.page;
  const navRoot = document.getElementById("doc-nav");
  const contentRoot = document.getElementById("doc-content");

  const NAV_DATA = pageType === "documents" ? DOCUMENTS_NAV : TUTORIALS_NAV;

  function getFileType(file) {
    if (!file) return "";
    return file.split(".").pop().toLowerCase();
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

      const container = document.createElement("div");
      container.className = "mermaid-chart";

      const renderId = `mermaid-${Date.now()}-${i}`;

      try {
        const { svg } = await window.mermaid.render(renderId, graphDefinition);
        container.innerHTML = svg;
        pre.replaceWith(container);
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

      await renderMermaidInContent(contentRoot);
    } catch (error) {
      contentRoot.innerHTML = `<p>Failed to load document: ${error.message}</p>`;
    }
  }

  function renderPDF(file) {
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
