document.addEventListener("DOMContentLoaded", function () {
  const navLinks = document.querySelectorAll("#doc-nav a");
  const content = document.getElementById("markdown-content");

  async function loadMarkdown(path, clickedLink = null) {
    try {
      content.innerHTML = "<p>Loading...</p>";

      const response = await fetch(path);
      if (!response.ok) {
        throw new Error("Failed to load markdown file.");
      }

      const mdText = await response.text();
      const html = marked.parse(mdText);
      content.innerHTML = html;

      navLinks.forEach(link => link.classList.remove("active"));
      if (clickedLink) {
        clickedLink.classList.add("active");
      }

      window.scrollTo({
        top: content.offsetTop - 30,
        behavior: "smooth"
      });
    } catch (error) {
      content.innerHTML = `
        <h2>Error</h2>
        <p>Unable to load document: ${path}</p>
        <pre>${error.message}</pre>
      `;
    }
  }

  navLinks.forEach(link => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const mdPath = this.getAttribute("data-md");
      loadMarkdown(mdPath, this);
    });
  });

  if (navLinks.length > 0) {
    const firstPath = navLinks[0].getAttribute("data-md");
    loadMarkdown(firstPath, navLinks[0]);
  }
});
