document.addEventListener("DOMContentLoaded", function () {
  const pageType = document.body.dataset.page;
  const navRoot = document.getElementById("doc-nav");
  const contentRoot = document.getElementById("doc-content");

  const NAV_DATA = pageType === "documents" ? DOCUMENTS_NAV : TUTORIALS_NAV;

  function getFileType(file) {
    if (!file) return "";
    return file.split(".").pop().toLowerCase();
  }

  function renderMarkdown(file) {
    contentRoot.className = "doc-content markdown-body";
    contentRoot.innerHTML = "<p>Loading markdown...</p>";

    fetch(file)
      .then(response => {
        if (!response.ok) {
          throw new Error("Failed to load markdown");
        }
        return response.text();
      })
      .then(text => {
        contentRoot.innerHTML = marked.parse(text);
      })
      .catch(error => {
        contentRoot.innerHTML = `<p>Failed to load document: ${error.message}</p>`;
      });
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
    if (!item.file) {
      contentRoot.className = "doc-content";
      contentRoot.innerHTML = "<p>No file found.</p>";
      return;
    }

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

  function collapseAllGroups() {
    document.querySelectorAll(".doc-subnav").forEach(el => {
      el.classList.remove("open");
    });
    document.querySelectorAll(".doc-nav-toggle").forEach(el => {
      el.classList.remove("open");
    });
  }

  function expandGroup(toggleBtn, subList) {
    if (toggleBtn && subList) {
      toggleBtn.classList.add("open");
      subList.classList.add("open");
    }
  }

  function activateLink(link, item) {
    document.querySelectorAll(".doc-link").forEach(el => el.classList.remove("active"));
    link.classList.add("active");
    loadDocument(item);

    const parentSubnav = link.closest(".doc-subnav");
    if (parentSubnav) {
      const parentWrapper = parentSubnav.closest(".doc-nav-item");
      const toggleBtn = parentWrapper ? parentWrapper.querySelector(".doc-nav-toggle") : null;
      expandGroup(toggleBtn, parentSubnav);
    }
  }

  function createNavItem(item) {
    const wrapper = document.createElement("div");
    wrapper.className = "doc-nav-item";

    if (item.children && item.children.length) {
      const toggle = document.createElement("button");
      toggle.className = "doc-nav-toggle";
      toggle.type = "button";
      toggle.textContent = item.title;

      const subList = document.createElement("div");
      subList.className = "doc-subnav";

      item.children.forEach(child => {
        const link = document.createElement("button");
        link.className = "doc-link";
        link.type = "button";
        link.textContent = child.title;
        link.dataset.docId = child.docId || "";

        link.addEventListener("click", function () {
          activateLink(link, child);
        });

        subList.appendChild(link);
      });

      toggle.addEventListener("click", function () {
        const isOpen = subList.classList.contains("open");
        subList.classList.toggle("open", !isOpen);
        toggle.classList.toggle("open", !isOpen);
      });

      wrapper.appendChild(toggle);
      wrapper.appendChild(subList);
    } else {
      const link = document.createElement("button");
      link.className = "doc-link";
      link.type = "button";
      link.textContent = item.title;
      link.dataset.docId = item.docId || "";

      link.addEventListener("click", function () {
        activateLink(link, item);
      });

      wrapper.appendChild(link);
    }

    return wrapper;
  }

  NAV_DATA.forEach(item => {
    navRoot.appendChild(createNavItem(item));
  });

  const params = new URLSearchParams(window.location.search);
  const targetDocId = params.get("doc");

  function findFirstDoc(items) {
    for (const item of items) {
      if (item.children && item.children.length) {
        return item.children[0];
      }
      if (item.file) {
        return item;
      }
    }
    return null;
  }

  function activateByDocId(items) {
    const buttons = document.querySelectorAll(".doc-link");

    let buttonIndex = 0;
    for (const item of items) {
      if (item.children && item.children.length) {
        for (const child of item.children) {
          if (child.docId === targetDocId) {
            const btn = buttons[buttonIndex];
            if (btn) {
              btn.classList.add("active");
              loadDocument(child);

              const subnav = btn.closest(".doc-subnav");
              const wrapper = btn.closest(".doc-nav-item");
              const toggle = wrapper ? wrapper.querySelector(".doc-nav-toggle") : null;
              expandGroup(toggle, subnav);
            }
            return true;
          }
          buttonIndex++;
        }
      } else if (item.file) {
        if (item.docId === targetDocId) {
          const btn = buttons[buttonIndex];
          if (btn) {
            btn.classList.add("active");
            loadDocument(item);
          }
          return true;
        }
        buttonIndex++;
      }
    }

    return false;
  }

  if (targetDocId && activateByDocId(NAV_DATA)) {
    return;
  }

  const defaultDoc = findFirstDoc(NAV_DATA);
  const defaultButton = document.querySelector(".doc-link");

  if (defaultDoc && defaultButton) {
    defaultButton.classList.add("active");
    loadDocument(defaultDoc);

    const subnav = defaultButton.closest(".doc-subnav");
    const wrapper = defaultButton.closest(".doc-nav-item");
    const toggle = wrapper ? wrapper.querySelector(".doc-nav-toggle") : null;
    expandGroup(toggle, subnav);
  }
});
