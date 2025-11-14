// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // project page style

// Fix missing marker images when bundling
import "./_leafletWorkaround.ts";
// Deterministic randomness helper
import luck from "./_luck.ts";

// Create basic UI elements
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
// Chance a given cell will contain a cache/token
const CACHE_SPAWN_PROBABILITY = 0.1;
// How many cells away (inclusive) the player can interact with a cache
const PROXIMITY_CELLS = 1;
// Value required on a single cache to win the game
const WIN_THRESHOLD = 5;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Inventory: player may carry at most one token (value) or none
let inventory: number | null = null;

// Track caches on the map by cell key "i,j" so we can update or combine them
const caches = new Map<
  string,
  { marker: leaflet.CircleMarker; value: number }
>();

// Persisted modifications by the player. If a cell key exists here it means
// the player changed the default state: the value is `number` for a token
// present, or `null` for an explicitly emptied cell. Cells not present in
// this map are ephemeral and will be respawned deterministically when
// coming back into view.
const modifiedCaches = new Map<string, number | null>();

type CellRecord = {
  i: number;
  j: number;
  rect: leaflet.Rectangle;
};

// Keep a record of currently rendered cells keyed by "i,j".
const cellRecords = new Map<string, CellRecord>();

// Win state
let hasCrafted = false;

function triggerWin() {
  if (hasCrafted) return;
  hasCrafted = true;
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.5)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "2000";

  const box = document.createElement("div");
  box.style.background = "white";
  box.style.padding = "2rem";
  box.style.borderRadius = "8px";
  box.style.boxShadow = "0 8px 32px rgba(0,0,0,0.25)";
  box.style.textAlign = "center";

  const title = document.createElement("h2");
  title.innerText = "You Win!";
  box.append(title);

  const close = document.createElement("button");
  close.innerText = "Close";
  close.style.padding = "0.5rem 1rem";
  close.addEventListener("click", () => overlay.remove());
  box.append(close);

  overlay.append(box);
  document.body.append(overlay);
}

// Update cache marker colors: green = pickable, red = out of reach or blocked
function updateCacheMarkerColor(key: string) {
  const entry = caches.get(key);
  if (!entry) return;
  const [iStr, jStr] = key.split(",");
  const i = Number(iStr);
  const j = Number(jStr);
  const playerCell = getPlayerCell();
  const dist = cellDistance(playerCell, [i, j]);
  const pickable = dist <= PROXIMITY_CELLS && inventory === null;
  // Distinct colors for the different token values
  const valueFill: Record<number, string> = {
    1: "#fee8c8",
    2: "#ffd59e",
    3: "#ffb482",
    4: "#ff8a5f",
    5: "#ff5e3a",
  };
  const fill = valueFill[entry.value] ?? "#cccccc";
  const stroke = pickable ? "#2a9d41" : "#5f5f5fff";
  entry.marker.setStyle({
    color: stroke,
    fillColor: fill,
    fillOpacity: 0.9,
  });
}

function updateAllCacheColors() {
  for (const key of caches.keys()) updateCacheMarkerColor(key);
}

function updateInventoryDisplay() {
  if (inventory === null) {
    statusPanelDiv.innerHTML = "Inventory: (empty)<br>Has token: no";
    return;
  }
  const total = inventory;
  statusPanelDiv.innerHTML =
    `Inventory: ${inventory} (total: ${total})<br>Has token: yes`;
}

updateInventoryDisplay();

// --- UI ---
function renderCraftingUI() {
  controlPanelDiv.innerHTML = "";
  const title = document.createElement("div");
  title.innerText = "Instructions";
  title.style.fontWeight = "600";
  title.style.marginBottom = "0.5rem";
  controlPanelDiv.append(title);

  const p1 = document.createElement("div");
  p1.innerHTML =
    `Click on a cache indicated by the various markers on display. Green means you can pick it up, red means it's out of reach or blocked.`;
  p1.style.marginBottom = "0.5rem";
  controlPanelDiv.append(p1);

  const p2 = document.createElement("div");
  p2.innerHTML =
    `Pick up: Open a cache popup within ${PROXIMITY_CELLS} cells and click <strong>Pick up</strong>. You can carry at most one token.`;
  p2.style.marginBottom = "0.5rem";
  controlPanelDiv.append(p1);

  const p3 = document.createElement("div");
  p3.innerHTML =
    `Place: Open a cache popup on a cell that contains a token of the same value and click <strong>Place token</strong> to combine them.`;
  controlPanelDiv.append(p3);
  const p4 = document.createElement("div");
  p4.style.marginTop = "0.6rem";
  p4.innerHTML =
    `Win condition: craft a single cache with that has a value of 5 or beyond.`;
  controlPanelDiv.append(p4);
}

// Render crafting UI initially and whenever inventory changes
renderCraftingUI();

// Helpers: convert lat/lng to cell coordinates (i,j) relative to classroom
function latLngToCell(latlng: leaflet.LatLngExpression): [number, number] {
  const position = leaflet.latLng(latlng);
  const latPosition = Math.round(
    (position.lat - CLASSROOM_LATLNG.lat) / TILE_DEGREES,
  );
  const lngPosition = Math.round(
    (position.lng - CLASSROOM_LATLNG.lng) / TILE_DEGREES,
  );
  return [latPosition, lngPosition];
}

function getPlayerCell(): [number, number] {
  return latLngToCell(playerMarker.getLatLng());
}

function cellDistance(a: [number, number], b: [number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

function cellKey(i: number, j: number) {
  return `${i},${j}`;
}

// Function to render a cell if not already rendered.
function cellRendered(i: number, j: number) {
  const key = cellKey(i, j);
  if (cellRecords.has(key)) return;
  const rect = drawCell(i, j);
  cellRecords.set(key, { i, j, rect });
}

// Remove a cell from the map, cleans cache if present.
function removeCell(i: number, j: number) {
  const key = cellKey(i, j);
  const rec = cellRecords.get(key);
  if (rec) {
    try {
      rec.rect.remove();
    } catch {
      /* ignore */
    }
    cellRecords.delete(key);
  }
  // Remove any rendered marker but not in cases of modified caches
  const cache = caches.get(key);
  if (cache) {
    try {
      cache.marker.remove();
    } catch {
      /* ignore */
    }
    caches.delete(key);
  }
}

// Update cells that are visible in the current map and rendered accordingly.
function updateVisibleCells() {
  const bounds = map.getBounds();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();

  const southMin = Math.floor((south - CLASSROOM_LATLNG.lat) / TILE_DEGREES);
  const northMax = Math.floor((north - CLASSROOM_LATLNG.lat) / TILE_DEGREES);
  const westMin = Math.floor((west - CLASSROOM_LATLNG.lng) / TILE_DEGREES);
  const eastMax = Math.floor((east - CLASSROOM_LATLNG.lng) / TILE_DEGREES);

  // Build a set of requested/visible keys
  const wanted = new Set<string>();
  for (let i = southMin; i <= northMax; i++) {
    for (let j = westMin; j <= eastMax; j++) {
      wanted.add(cellKey(i, j));
      if (!cellRecords.has(cellKey(i, j))) {
        cellRendered(i, j);
      }
    }
  }

  // Remove any rendered cells that aren't wanted
  for (const key of Array.from(cellRecords.keys())) {
    if (!wanted.has(key)) {
      const [iStr, jStr] = key.split(",");
      removeCell(Number(iStr), Number(jStr));
    }
  }

  updateAllCacheColors();
}

// -- Player movement ---
function movePlayerByCells(latitudeUpdate: number, longitudeUpdate: number) {
  const current = playerMarker.getLatLng();
  const newLat = current.lat + latitudeUpdate * TILE_DEGREES;
  const newLng = current.lng + longitudeUpdate * TILE_DEGREES;
  const newLatLng = leaflet.latLng(newLat, newLng);
  playerMarker.setLatLng(newLatLng);
  // Pan the map to keep the player visible
  try {
    map.panTo(newLatLng);
  } catch {
    /* ignore */
  }
  // Update visible cells (may spawn/despawn) and refresh colors
  updateVisibleCells();
}

// Keyboard handling
globalThis.addEventListener("keydown", (e: KeyboardEvent) => {
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  const key = e.key.toLowerCase();
  if (key === "w") movePlayerByCells(1, 0);
  else if (key === "s") movePlayerByCells(-1, 0);
  else if (key === "a") movePlayerByCells(0, -1);
  else if (key === "d") movePlayerByCells(0, 1);
});

// Draw a single rectangular cell on the map at cell coordinates i,j
function drawCell(i: number, j: number) {
  const origin = CLASSROOM_LATLNG;

  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [
      origin.lat + (i + 1) * TILE_DEGREES,
      origin.lng + (j + 1) * TILE_DEGREES,
    ],
  ]);

  const rect = leaflet.rectangle(bounds, {
    color: "#1f78b4",
    weight: 2,
    fillOpacity: 0.12,
  });
  rect.addTo(map);

  // A check to if the cell has a player modified cache, in which we restore the memory for it.
  const key = `${i},${j}`;
  const modified = modifiedCaches.has(key)
    ? modifiedCaches.get(key)
    : undefined;
  if (modified !== undefined) {
    // Cell is explicitly empty or has a modified cache.
    if (modified === null) {
      rect.bindPopup(() => {
        const popupDiv = document.createElement("div");
        popupDiv.innerHTML = `
                <div>Cell: ${i}, ${j}</div>
                <button id="drop">Drop token here</button>
                <div id="dropMsg" style="margin-top:.4rem;color:#b10000"></div>`;
        const dropBtn = popupDiv.querySelector<HTMLButtonElement>("#drop")!;
        const msgDiv = popupDiv.querySelector<HTMLDivElement>("#dropMsg")!;
        dropBtn.addEventListener("click", () => {
          const playerCell = getPlayerCell();
          const dist = cellDistance(playerCell, [i, j]);
          if (dist > PROXIMITY_CELLS) {
            msgDiv.innerText = `Too far (${dist} cells). Move closer to drop.`;
            return;
          }
          if (inventory === null) {
            msgDiv.innerText = "You have no token to drop.";
            return;
          }
          const val = inventory!;
          const center = bounds.getCenter();
          const cacheMarker = leaflet.circleMarker(center, {
            radius: 6,
            color: "#222222",
            fillOpacity: 0.9,
          });
          cacheMarker.addTo(map);
          caches.set(key, { marker: cacheMarker, value: val });
          // Modification remains off-screen
          modifiedCaches.set(key, val);
          cacheMarker.bindPopup(() => {
            const popupDiv = document.createElement("div");
            const cached = caches.get(key)!;
            popupDiv.innerHTML = `
                  <div>There is a cache here at "${i},${j}". It has value <span id="value">${cached.value}</span>.</div>
                  <button id="pickup">Pick up</button>
                  <button id="place" style="margin-left:.5rem">Place token</button>
                  <div id="pickupMsg" style="margin-top:.4rem;color:#b10000"></div>`;

            const pickupBtn = popupDiv.querySelector<HTMLButtonElement>(
              "#pickup",
            )!;
            const placeBtn = popupDiv.querySelector<HTMLButtonElement>(
              "#place",
            )!;
            const msgDiv = popupDiv.querySelector<HTMLDivElement>(
              "#pickupMsg",
            )!;

            pickupBtn.addEventListener("click", () => {
              const playerCell = getPlayerCell();
              const dist = cellDistance(playerCell, [i, j]);
              if (dist <= PROXIMITY_CELLS) {
                if (inventory === null) {
                  cached.marker.remove();
                  caches.delete(key);
                  inventory = cached.value;
                  // Modification remains off-screen
                  modifiedCaches.set(key, null);
                  updateInventoryDisplay();
                  renderCraftingUI();
                  msgDiv.innerText = "Picked up.";
                  updateAllCacheColors();
                } else {
                  msgDiv.innerText =
                    "You're already carrying a token. Drop it before picking up another.";
                }
              } else {
                msgDiv.innerText =
                  `Too far (${dist} cells). Move within ${PROXIMITY_CELLS} cells to pick up.`;
              }
            });

            placeBtn.addEventListener("click", () => {
              const playerCell = getPlayerCell();
              const dist = cellDistance(playerCell, [i, j]);
              if (dist > PROXIMITY_CELLS) {
                msgDiv.innerText =
                  `Too far (${dist} cells). Move within ${PROXIMITY_CELLS} cells to place.`;
                return;
              }
              if (inventory === null) {
                msgDiv.innerText = "You have no token to place.";
                return;
              }
              // Combine if values match
              if (inventory === cached.value) {
                cached.value = cached.value * 2;
                modifiedCaches.set(key, cached.value);
                const valSpan = popupDiv.querySelector<HTMLSpanElement>(
                  "#value",
                );
                if (valSpan) valSpan.innerText = String(cached.value);
                inventory = null;
                updateInventoryDisplay();
                renderCraftingUI();
                msgDiv.innerText = `Placed token and crafted ${cached.value}.`;
                updateAllCacheColors();
                if (!hasCrafted && cached.value >= WIN_THRESHOLD) triggerWin();
              } else {
                msgDiv.innerText =
                  "Token values do not match; cannot place here.";
              }
            });

            return popupDiv;
          });
          inventory = null;
          updateInventoryDisplay();
          renderCraftingUI();
          msgDiv.innerText = `Dropped token (${val}).`;
          updateAllCacheColors();
        });
        return popupDiv;
      });
    } else {
      // Modified cache exists and should be rendered.
      const val = modified;
      const center = bounds.getCenter();
      const cacheMarker = leaflet.circleMarker(center, {
        radius: 6,
        color: "#222222",
        fillOpacity: 0.9,
      });
      cacheMarker.addTo(map);
      caches.set(key, { marker: cacheMarker, value: val });
      updateCacheMarkerColor(key);
      cacheMarker.bindPopup(() => {
        const popupDiv = document.createElement("div");
        const cached = caches.get(key)!;
        popupDiv.innerHTML = `
                  <div>There is a cache here at "${i},${j}". It has value <span id="value">${cached.value}</span>.</div>
                  <button id="pickup">Pick up</button>
                  <button id="place" style="margin-left:.5rem">Place token</button>
                  <div id="pickupMsg" style="margin-top:.4rem;color:#b10000"></div>`;

        const pickupBtn = popupDiv.querySelector<HTMLButtonElement>("#pickup")!;
        const placeBtn = popupDiv.querySelector<HTMLButtonElement>("#place")!;
        const msgDiv = popupDiv.querySelector<HTMLDivElement>("#pickupMsg")!;

        pickupBtn.addEventListener("click", () => {
          const playerCell = getPlayerCell();
          const dist = cellDistance(playerCell, [i, j]);
          if (dist <= PROXIMITY_CELLS) {
            if (inventory === null) {
              cached.marker.remove();
              caches.delete(key);
              inventory = cached.value;
              // Modification remains off-screen
              modifiedCaches.set(key, null);
              updateInventoryDisplay();
              renderCraftingUI();
              msgDiv.innerText = "Picked up.";
              updateAllCacheColors();
            } else {
              msgDiv.innerText =
                "You're already carrying a token. Drop it before picking up another.";
            }
          } else {
            msgDiv.innerText =
              `Too far (${dist} cells). Move within ${PROXIMITY_CELLS} cells to pick up.`;
          }
        });

        placeBtn.addEventListener("click", () => {
          const playerCell = getPlayerCell();
          const dist = cellDistance(playerCell, [i, j]);
          if (dist > PROXIMITY_CELLS) {
            msgDiv.innerText =
              `Too far (${dist} cells). Move within ${PROXIMITY_CELLS} cells to place.`;
            return;
          }
          if (inventory === null) {
            msgDiv.innerText = "You have no token to place.";
            return;
          }
          if (inventory === cached.value) {
            cached.value = cached.value * 2;
            modifiedCaches.set(key, cached.value);
            const valSpan = popupDiv.querySelector<HTMLSpanElement>("#value");
            if (valSpan) valSpan.innerText = String(cached.value);
            inventory = null;
            updateInventoryDisplay();
            renderCraftingUI();
            msgDiv.innerText = `Placed token and crafted ${cached.value}.`;
            updateAllCacheColors();
            if (!hasCrafted && cached.value >= WIN_THRESHOLD) triggerWin();
          } else {
            msgDiv.innerText = "Token values do not match; cannot place here.";
          }
        });

        return popupDiv;
      });
    }
  } else {
    // Default State of no modification
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      // Bias values toward 1 and 2 but occasionally spawn larger tokens
      const r = luck([i, j, "initialValue"].toString());
      let cacheValue: number;
      if (r < 0.6) cacheValue = 1;
      else if (r < 0.9) cacheValue = 2;
      else if (r < 0.97) cacheValue = 3;
      else if (r < 0.995) cacheValue = 4;
      else cacheValue = 5;

      const center = bounds.getCenter();
      const cacheMarker = leaflet.circleMarker(center, {
        radius: 6,
        color: "#222222",
        fillOpacity: 0.9,
      });
      cacheMarker.addTo(map);
      caches.set(key, { marker: cacheMarker, value: cacheValue });
      updateCacheMarkerColor(key);
      cacheMarker.bindPopup(() => {
        const popupDiv = document.createElement("div");
        const cached = caches.get(key)!;
        popupDiv.innerHTML = `
                  <div>There is a cache here at "${i},${j}". It has value <span id="value">${cached.value}</span>.</div>
                  <button id="pickup">Pick up</button>
                  <button id="place" style="margin-left:.5rem">Place token</button>
                  <div id="pickupMsg" style="margin-top:.4rem;color:#b10000"></div>`;

        const pickupBtn = popupDiv.querySelector<HTMLButtonElement>("#pickup")!;
        const placeBtn = popupDiv.querySelector<HTMLButtonElement>("#place")!;
        const msgDiv = popupDiv.querySelector<HTMLDivElement>("#pickupMsg")!;

        pickupBtn.addEventListener("click", () => {
          const playerCell = getPlayerCell();
          const dist = cellDistance(playerCell, [i, j]);
          if (dist <= PROXIMITY_CELLS) {
            if (inventory === null) {
              cached.marker.remove();
              caches.delete(key);
              inventory = cached.value;
              // Modification remains off-screen
              modifiedCaches.set(key, null);
              updateInventoryDisplay();
              renderCraftingUI();
              msgDiv.innerText = "Picked up.";
              updateAllCacheColors();
            } else {
              msgDiv.innerText =
                "You're already carrying a token. Drop it before picking up another.";
            }
          } else {
            msgDiv.innerText =
              `Too far (${dist} cells). Move within ${PROXIMITY_CELLS} cells to pick up.`;
          }
        });

        placeBtn.addEventListener("click", () => {
          const playerCell = getPlayerCell();
          const dist = cellDistance(playerCell, [i, j]);
          if (dist > PROXIMITY_CELLS) {
            msgDiv.innerText =
              `Too far (${dist} cells). Move within ${PROXIMITY_CELLS} cells to place.`;
            return;
          }
          if (inventory === null) {
            msgDiv.innerText = "You have no token to place.";
            return;
          }
          // Combine if values match
          if (inventory === cached.value) {
            cached.value = cached.value * 2;
            // persist the modified value
            modifiedCaches.set(key, cached.value);
            const valSpan = popupDiv.querySelector<HTMLSpanElement>("#value");
            if (valSpan) valSpan.innerText = String(cached.value);
            inventory = null;
            updateInventoryDisplay();
            renderCraftingUI();
            msgDiv.innerText = `Placed token and crafted ${cached.value}.`;
            updateAllCacheColors();
            if (!hasCrafted && cached.value >= WIN_THRESHOLD) triggerWin();
          } else {
            msgDiv.innerText = "Token values do not match; cannot place here.";
          }
        });

        return popupDiv;
      });
    } else {
      // No cache: bind a simple info popup to the cell
      rect.bindPopup(`Cell: ${i}, ${j}`);
    }
  }
  // Return the rectangle so callers can keep track of rendered cells
  return rect;
}

updateVisibleCells();

map.on("moveend", () => {
  updateVisibleCells();
});

updateAllCacheColors();
