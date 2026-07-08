(function () {
  var root = document.documentElement;
  var savedTheme = localStorage.getItem("profile-theme");
  if (savedTheme) {
    root.dataset.theme = savedTheme;
  }

  var themeButton = document.querySelector("[data-theme-toggle]");
  if (themeButton) {
    themeButton.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "" : "dark";
      if (next) {
        root.dataset.theme = next;
        localStorage.setItem("profile-theme", next);
      } else {
        delete root.dataset.theme;
        localStorage.removeItem("profile-theme");
      }
    });
  }

  var yearTarget = document.querySelector("[data-current-year]");
  if (yearTarget) {
    yearTarget.textContent = String(new Date().getFullYear());
  }

  var copyButton = document.querySelector("[data-copy-email]");
  if (copyButton) {
    copyButton.addEventListener("click", function () {
      var email = copyButton.getAttribute("data-copy-email") || "";
      var setCopied = function () {
        copyButton.textContent = "Copied";
        window.setTimeout(function () {
          copyButton.textContent = "Copy email";
        }, 1500);
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(email).then(setCopied).catch(function () {
          fallbackCopy(email, setCopied);
        });
      } else {
        fallbackCopy(email, setCopied);
      }
    });
  }

  function fallbackCopy(text, done) {
    var input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand("copy");
      done();
    } finally {
      input.remove();
    }
  }

  var filters = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
  var publications = Array.prototype.slice.call(document.querySelectorAll(".publication-list [data-year]"));
  filters.forEach(function (button) {
    button.addEventListener("click", function () {
      var filter = button.getAttribute("data-filter");
      filters.forEach(function (item) {
        item.classList.toggle("is-active", item === button);
      });
      publications.forEach(function (item) {
        var visible = filter === "all" || item.getAttribute("data-year") === filter;
        item.classList.toggle("is-hidden", !visible);
      });
    });
  });

  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".top-nav a"));
  var sectionTargets = navLinks
    .map(function (link) {
      return document.querySelector(link.getAttribute("href"));
    })
    .filter(Boolean);

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        navLinks.forEach(function (link) {
          link.classList.toggle("is-active", link.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-25% 0px -60% 0px", threshold: 0.01 });

    sectionTargets.forEach(function (section) {
      observer.observe(section);
    });
  }
}());
