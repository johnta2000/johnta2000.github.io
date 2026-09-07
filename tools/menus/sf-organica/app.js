(() => {
  const data = window.RESTAURANT_MENU || window.SF_ORGANICA_MENU || window.HEM_MENU;
  if (!data) return;

  const searchInput = document.querySelector("#searchInput");
  const sortSelect = document.querySelector("#sortSelect");
  const categoryNav = document.querySelector("#categoryNav");
  const menuGrid = document.querySelector("#menuGrid");
  const resultCount = document.querySelector("#resultCount");
  const clearButton = document.querySelector("#clearButton");
  const loadMore = document.querySelector("#loadMore");
  const emptyState = document.querySelector("#emptyState");
  const minPriceInput = document.querySelector("#minPrice");
  const maxPriceInput = document.querySelector("#maxPrice");
  const pricePresetButtons = [...document.querySelectorAll("[data-price-preset]")];

  const categoryMap = new Map(data.categories.map((category) => [category.id, category]));
  const items = data.items.map((item, index) => ({
    ...item,
    index,
    search: `${item.name} ${item.description || ""} ${categoryMap.get(item.categoryId)?.name || ""}`.toLowerCase(),
  }));

  let selectedCategory = "all";
  let visibleCount = 120;

  const money = (cents) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

  const escapeHtml = (value = "") => value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);

  const categoryButton = (id, label, count) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.category = id;
    button.className = id === selectedCategory ? "active" : "";
    button.innerHTML = `${escapeHtml(label)} <span>${count.toLocaleString()}</span>`;
    button.addEventListener("click", () => {
      selectedCategory = id;
      visibleCount = 120;
      categoryNav.querySelectorAll("button").forEach((node) => node.classList.toggle("active", node === button));
      render();
      document.querySelector("#menu-heading").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return button;
  };

  categoryNav.append(categoryButton("all", "All items", items.length));
  data.categories.forEach((category) => categoryNav.append(categoryButton(category.id, category.name, category.count)));

  const getResults = () => {
    const query = searchInput.value.trim().toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    const minPrice = minPriceInput.value === "" ? 0 : Number(minPriceInput.value) * 100;
    const maxPrice = maxPriceInput.value === "" ? Infinity : Number(maxPriceInput.value) * 100;
    const filtered = items.filter((item) => {
      const categoryMatch = selectedCategory === "all" || item.categoryId === selectedCategory;
      const searchMatch = !terms.length || terms.every((term) => item.search.includes(term));
      const priceMatch = item.price >= minPrice && item.price <= maxPrice;
      return categoryMatch && searchMatch && priceMatch;
    });

    switch (sortSelect.value) {
      case "az": return filtered.sort((a, b) => a.name.localeCompare(b.name));
      case "price-low": return filtered.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
      case "price-high": return filtered.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
      default: return filtered.sort((a, b) => a.index - b.index);
    }
  };

  const render = () => {
    const results = getResults();
    const shown = results.slice(0, visibleCount);
    const categoryName = selectedCategory === "all" ? "all sections" : categoryMap.get(selectedCategory)?.name;
    resultCount.innerHTML = `<strong>${results.length.toLocaleString()}</strong> ${results.length === 1 ? "item" : "items"} in ${escapeHtml(categoryName)}`;
    clearButton.hidden = selectedCategory === "all" && !searchInput.value && !minPriceInput.value && !maxPriceInput.value;
    emptyState.hidden = results.length !== 0;
    loadMore.hidden = shown.length >= results.length;
    loadMore.textContent = `Show more items · ${Math.min(120, results.length - shown.length).toLocaleString()} next`;
    menuGrid.innerHTML = shown.map((item) => {
      const category = categoryMap.get(item.categoryId)?.name || "Other items";
      const description = item.description ? `<p>${escapeHtml(item.description)}</p>` : "";
      const tags = [category, item.ageRestricted ? "ID required" : ""].filter(Boolean).join(" · ");
      return `<a class="menu-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" aria-label="${escapeHtml(item.name)}, ${money(item.price)} — view on Clover"><div><h3>${escapeHtml(item.name)}</h3>${description}<span class="item-meta">${escapeHtml(tags)}</span></div><footer><strong>${money(item.price)}</strong><span>View on Clover ↗</span></footer></a>`;
    }).join("");
  };

  let searchTimer;
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { visibleCount = 120; render(); }, 40);
  });
  sortSelect.addEventListener("change", () => { visibleCount = 120; render(); });
  const pricePresets = {
    "all": ["", ""],
    "under-5": ["", "5"],
    "5-10": ["5", "10"],
    "10-20": ["10", "20"],
    "20-plus": ["20", ""],
  };
  pricePresetButtons.forEach((button) => button.addEventListener("click", () => {
    [minPriceInput.value, maxPriceInput.value] = pricePresets[button.dataset.pricePreset];
    pricePresetButtons.forEach((node) => node.classList.toggle("active", node === button));
    visibleCount = 120;
    render();
  }));
  [minPriceInput, maxPriceInput].forEach((input) => input.addEventListener("input", () => {
    pricePresetButtons.forEach((button) => button.classList.remove("active"));
    visibleCount = 120;
    render();
  }));
  clearButton.addEventListener("click", () => {
    searchInput.value = "";
    minPriceInput.value = "";
    maxPriceInput.value = "";
    selectedCategory = "all";
    visibleCount = 120;
    categoryNav.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.category === "all"));
    pricePresetButtons.forEach((button) => button.classList.toggle("active", button.dataset.pricePreset === "all"));
    render();
    searchInput.focus();
  });
  loadMore.addEventListener("click", () => { visibleCount += 120; render(); });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
    }
    if (event.key === "Escape" && document.activeElement === searchInput) {
      searchInput.value = "";
      searchInput.blur();
      visibleCount = 120;
      render();
    }
  });

  document.querySelector("#itemTotal").textContent = items.length.toLocaleString();
  document.querySelector("#categoryTotal").textContent = data.categories.length.toLocaleString();
  render();
})();
