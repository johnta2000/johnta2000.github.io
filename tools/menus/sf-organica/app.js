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
  const priceToggle = document.querySelector("#priceToggle");
  const pricePopover = document.querySelector("#pricePopover");
  const priceReset = document.querySelector("#priceReset");
  const minPriceLabel = document.querySelector("#minPriceLabel");
  const maxPriceLabel = document.querySelector("#maxPriceLabel");
  const priceSummary = document.querySelector("#priceSummary");
  const rangeShell = document.querySelector("#rangeShell");
  const showMenuImages = document.body.classList.contains("hem");

  const categoryMap = new Map(data.categories.map((category) => [category.id, category]));
  const items = data.items.map((item, index) => ({
    ...item,
    index,
    search: `${item.name} ${item.description || ""} ${categoryMap.get(item.categoryId)?.name || ""}`.toLowerCase(),
  }));

  let selectedCategory = "all";
  let visibleCount = 120;
  const absoluteMinPrice = Math.min(...items.map((item) => item.price));
  const absoluteMaxPrice = Math.max(...items.map((item) => item.price));

  const money = (cents) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

  const escapeHtml = (value = "") => value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);

  [minPriceInput, maxPriceInput].forEach((input) => {
    input.min = absoluteMinPrice;
    input.max = absoluteMaxPrice;
    input.step = 1;
  });
  minPriceInput.value = absoluteMinPrice;
  maxPriceInput.value = absoluteMaxPrice;

  const isPriceFiltered = () => Number(minPriceInput.value) !== absoluteMinPrice || Number(maxPriceInput.value) !== absoluteMaxPrice;

  const updatePriceUI = () => {
    const minPrice = Number(minPriceInput.value);
    const maxPrice = Number(maxPriceInput.value);
    const span = Math.max(1, absoluteMaxPrice - absoluteMinPrice);
    const start = ((minPrice - absoluteMinPrice) / span) * 100;
    const end = ((maxPrice - absoluteMinPrice) / span) * 100;
    rangeShell.style.setProperty("--range-start", `${start}%`);
    rangeShell.style.setProperty("--range-end", `${end}%`);
    minPriceLabel.textContent = money(minPrice);
    maxPriceLabel.textContent = money(maxPrice);
    priceSummary.textContent = isPriceFiltered() ? `${money(minPrice)}–${money(maxPrice)}` : "";
    priceToggle.classList.toggle("active", isPriceFiltered());
  };

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
    const minPrice = Number(minPriceInput.value);
    const maxPrice = Number(maxPriceInput.value);
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
    clearButton.hidden = selectedCategory === "all" && !searchInput.value && !isPriceFiltered();
    emptyState.hidden = results.length !== 0;
    loadMore.hidden = shown.length >= results.length;
    loadMore.textContent = `Show more items · ${Math.min(120, results.length - shown.length).toLocaleString()} next`;
    menuGrid.innerHTML = shown.map((item) => {
      const category = categoryMap.get(item.categoryId)?.name || "Other items";
      const description = item.description ? `<p>${escapeHtml(item.description)}</p>` : "";
      const tags = [category, item.ageRestricted ? "ID required" : ""].filter(Boolean).join(" · ");
      const photo = showMenuImages
        ? item.image
          ? `<div class="item-photo"><img src="${escapeHtml(item.image)}" alt="" width="375" height="375" loading="lazy" decoding="async" /></div>`
          : `<div class="item-photo item-photo-placeholder" aria-hidden="true"><span>HẺM</span></div>`
        : "";
      const cardClass = showMenuImages ? "menu-item photo-card" : "menu-item";
      return `<a class="${cardClass}" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" aria-label="${escapeHtml(item.name)}, ${money(item.price)} — view on Clover">${photo}<div><h3>${escapeHtml(item.name)}</h3>${description}<span class="item-meta">${escapeHtml(tags)}</span></div><footer><strong>${money(item.price)}</strong><span>View on Clover ↗</span></footer></a>`;
    }).join("");
  };

  let searchTimer;
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { visibleCount = 120; render(); }, 40);
  });
  sortSelect.addEventListener("change", () => { visibleCount = 120; render(); });
  priceToggle.addEventListener("click", () => {
    pricePopover.hidden = !pricePopover.hidden;
    priceToggle.setAttribute("aria-expanded", String(!pricePopover.hidden));
  });
  priceReset.addEventListener("click", () => {
    minPriceInput.value = absoluteMinPrice;
    maxPriceInput.value = absoluteMaxPrice;
    updatePriceUI();
    visibleCount = 120;
    render();
  });
  minPriceInput.addEventListener("input", () => {
    if (Number(minPriceInput.value) > Number(maxPriceInput.value)) minPriceInput.value = maxPriceInput.value;
    updatePriceUI();
    visibleCount = 120;
    render();
  });
  maxPriceInput.addEventListener("input", () => {
    if (Number(maxPriceInput.value) < Number(minPriceInput.value)) maxPriceInput.value = minPriceInput.value;
    updatePriceUI();
    visibleCount = 120;
    render();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".price-filter") && !pricePopover.hidden) {
      pricePopover.hidden = true;
      priceToggle.setAttribute("aria-expanded", "false");
    }
  });
  clearButton.addEventListener("click", () => {
    searchInput.value = "";
    minPriceInput.value = absoluteMinPrice;
    maxPriceInput.value = absoluteMaxPrice;
    selectedCategory = "all";
    visibleCount = 120;
    categoryNav.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.category === "all"));
    updatePriceUI();
    render();
    searchInput.focus();
  });
  loadMore.addEventListener("click", () => { visibleCount += 120; render(); });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
    }
    if (event.key === "Escape") {
      if (!pricePopover.hidden) {
        pricePopover.hidden = true;
        priceToggle.setAttribute("aria-expanded", "false");
        priceToggle.focus();
      } else if (document.activeElement === searchInput) {
        searchInput.value = "";
        searchInput.blur();
        visibleCount = 120;
        render();
      }
    }
  });

  document.querySelector("#itemTotal").textContent = items.length.toLocaleString();
  document.querySelector("#categoryTotal").textContent = data.categories.length.toLocaleString();
  updatePriceUI();
  render();
})();
