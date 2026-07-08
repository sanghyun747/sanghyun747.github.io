(function () {
  var yearTarget = document.querySelector("[data-current-year]");
  if (yearTarget) {
    yearTarget.textContent = String(new Date().getFullYear());
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
}());
