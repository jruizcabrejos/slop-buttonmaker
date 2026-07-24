import { unzipSync } from "../fflate/fflate.esm.js";

const DATABASE_NAME = "buttonmaker-local-assets";
const DATABASE_VERSION = 1;
const STORE_NAME = "assets";
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_ASSETS = 500;
const MAX_LIBRARY_ASSETS = 1000;

const IMAGE_TYPES = new Map([
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);
const SUPPORTED_IMAGE_TYPES = new Set(IMAGE_TYPES.values());

export class AssetLibraryController {
  constructor({ media }) {
    this.media = media;
    this.input = document.getElementById("local_asset_input");
    this.list = document.getElementById("local_asset_list");
    this.clearButton = document.getElementById("clear_local_assets");
    this.status = document.getElementById("asset_import_status");
    this.assets = new Map();
    this.assetUrls = new Map();
    this.store = null;

    this.handleImport = this.handleImport.bind(this);
    this.handleAssetClick = this.handleAssetClick.bind(this);
    this.clearAssets = this.clearAssets.bind(this);
    this.dispose = this.dispose.bind(this);

    this.input.addEventListener("change", this.handleImport);
    this.list.addEventListener("click", this.handleAssetClick);
    this.clearButton.addEventListener("click", this.clearAssets);
    window.addEventListener("beforeunload", this.dispose);

    this.ready = this.initialize();
  }

  async initialize() {
    try {
      this.store = await LocalAssetStore.open();
      const storedAssets = await this.store.getAll();

      for (const asset of storedAssets) {
        this.addToLibrary(asset);
      }
    } catch (error) {
      console.warn("Local asset persistence is unavailable.", error);
      this.store = null;
    }

    this.updateStatus();
  }

  async handleImport(event) {
    const selectedFiles = Array.from(event.target.files || []);

    if (selectedFiles.length === 0) {
      return;
    }

    await this.ready;
    this.input.disabled = true;
    this.status.textContent = "Importing...";

    try {
      const files = [];

      for (const file of selectedFiles) {
        if (this.isZipFile(file)) {
          files.push(...await this.extractArchive(file));
        } else if (this.getImageType(file.name, file.type)) {
          files.push(file);
        }
      }

      const remainingCapacity = Math.max(
        0,
        MAX_LIBRARY_ASSETS - this.assets.size
      );
      const acceptedFiles = files.slice(0, remainingCapacity);

      if (acceptedFiles.length === 0) {
        this.status.textContent = "No supported local assets found.";
        return;
      }

      const records = acceptedFiles.map(file =>
        this.createAssetRecord(file)
      );

      for (const record of records) {
        this.addToLibrary(record);
      }

      if (this.store) {
        try {
          await this.store.putAll(records);
        } catch (error) {
          console.warn("Local assets could not be persisted.", error);
          this.store.close();
          this.store = null;
        }
      }

      this.updateStatus(
        `Imported ${records.length} local ` +
        `${records.length === 1 ? "asset" : "assets"}. ` +
        `${this.assets.size} ready.`
      );
    } catch (error) {
      console.warn("Local assets could not be imported.", error);
      this.status.textContent = "The selected assets could not be imported.";
    } finally {
      this.input.value = "";
      this.input.disabled = false;
    }
  }

  async extractArchive(file) {
    if (file.size > MAX_ARCHIVE_BYTES) {
      throw new Error("The ZIP archive is too large.");
    }

    let acceptedCount = 0;
    let extractedBytes = 0;
    const archive = unzipSync(
      new Uint8Array(await file.arrayBuffer()),
      {
        filter: entry => {
          const type = this.getImageType(entry.name);
          const size = Number(entry.originalSize) || 0;

          if (
            !type ||
            size > MAX_ENTRY_BYTES ||
            acceptedCount >= MAX_ARCHIVE_ASSETS ||
            extractedBytes + size > MAX_EXTRACTED_BYTES
          ) {
            return false;
          }

          acceptedCount += 1;
          extractedBytes += size;
          return true;
        }
      }
    );

    let actualExtractedBytes = 0;

    return Object.entries(archive).map(([path, bytes]) => {
      actualExtractedBytes += bytes.length;

      if (
        bytes.length > MAX_ENTRY_BYTES ||
        actualExtractedBytes > MAX_EXTRACTED_BYTES
      ) {
        throw new Error("The ZIP contents exceed the import limits.");
      }

      const name = this.getBaseName(path);
      return new File(
        [bytes],
        name,
        {
          type: this.getImageType(name),
          lastModified: file.lastModified
        }
      );
    });
  }

  async handleAssetClick(event) {
    const button = event.target.closest("[data-asset-id]");

    if (!button || !this.list.contains(button)) {
      return;
    }

    await this.ready;
    const asset = this.assets.get(button.dataset.assetId);

    if (!asset) {
      return;
    }

    button.disabled = true;

    try {
      const file = new File(
        [asset.blob],
        asset.name,
        {
          type: asset.type,
          lastModified: asset.addedAt
        }
      );
      const image = await this.media.addImageFile(
        file,
        null,
        { type: "detail" }
      );

      if (image) {
        this.status.textContent = `${asset.name} added.`;
      } else {
        this.status.textContent = `${asset.name} could not be added.`;
      }
    } finally {
      button.disabled = false;
    }
  }

  async clearAssets() {
    if (
      this.assets.size === 0 ||
      !window.confirm("Remove all imported assets from this browser?")
    ) {
      return;
    }

    await this.ready;

    if (this.store) {
      try {
        await this.store.clear();
      } catch (error) {
        console.warn("Stored assets could not be cleared.", error);
      }
    }

    this.releaseAssetUrls();
    this.assets.clear();
    this.list.replaceChildren();
    this.updateStatus();
  }

  createAssetRecord(file) {
    const type = this.getImageType(file.name, file.type);
    const id =
      window.crypto.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return {
      id,
      name: this.getBaseName(file.name),
      type,
      blob: file.slice(0, file.size, type),
      addedAt: Date.now()
    };
  }

  addToLibrary(asset) {
    if (
      !asset ||
      !asset.id ||
      !asset.blob ||
      !this.getImageType(asset.name, asset.type) ||
      this.assets.has(asset.id) ||
      this.assets.size >= MAX_LIBRARY_ASSETS
    ) {
      return;
    }

    this.assets.set(asset.id, asset);

    const url = URL.createObjectURL(asset.blob);
    this.assetUrls.set(asset.id, url);

    const item = document.createElement("li");
    const button = document.createElement("button");
    const image = document.createElement("img");
    button.type = "button";
    button.classList.add("detail-option", "local-asset-option");
    button.dataset.assetId = asset.id;
    button.title = `Add ${asset.name}`;
    image.src = url;
    image.alt = asset.name;
    image.loading = "lazy";
    image.draggable = false;
    button.appendChild(image);
    item.appendChild(button);
    this.list.appendChild(item);
  }

  updateStatus(message = "") {
    this.clearButton.disabled = this.assets.size === 0;
    this.status.textContent = message || (
      this.assets.size === 0
        ? "No local assets."
        : `${this.assets.size} local ` +
          `${this.assets.size === 1 ? "asset" : "assets"}.`
    );
  }

  isZipFile(file) {
    return (
      /\.zip$/i.test(file.name) ||
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed"
    );
  }

  getImageType(name, suppliedType = "") {
    const normalizedType = suppliedType.toLowerCase();

    if (SUPPORTED_IMAGE_TYPES.has(normalizedType)) {
      return normalizedType;
    }

    const extension = name.match(/\.[^.\\/]+$/)?.[0].toLowerCase();
    return IMAGE_TYPES.get(extension) || "";
  }

  getBaseName(path) {
    return path.split(/[\\/]/).filter(Boolean).at(-1) || "asset";
  }

  releaseAssetUrls() {
    for (const url of this.assetUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.assetUrls.clear();
  }

  dispose() {
    this.releaseAssetUrls();
    this.store?.close();
  }
}

class LocalAssetStore {
  constructor(database) {
    this.database = database;
  }

  static open() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      const request = window.indexedDB.open(
        DATABASE_NAME,
        DATABASE_VERSION
      );
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, {
            keyPath: "id"
          });
        }
      });
      request.addEventListener("success", () => {
        resolve(new LocalAssetStore(request.result));
      });
      request.addEventListener("error", () => {
        reject(request.error);
      });
      request.addEventListener("blocked", () => {
        reject(new Error("The local asset database is blocked."));
      });
    });
  }

  getAll() {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        STORE_NAME,
        "readonly"
      );
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
  }

  putAll(records) {
    const transaction = this.database.transaction(
      STORE_NAME,
      "readwrite"
    );
    const store = transaction.objectStore(STORE_NAME);

    for (const record of records) {
      store.put(record);
    }

    return this.waitForTransaction(transaction);
  }

  clear() {
    const transaction = this.database.transaction(
      STORE_NAME,
      "readwrite"
    );
    transaction.objectStore(STORE_NAME).clear();
    return this.waitForTransaction(transaction);
  }

  waitForTransaction(transaction) {
    return new Promise((resolve, reject) => {
      transaction.addEventListener("complete", resolve);
      transaction.addEventListener("abort", () => {
        reject(transaction.error);
      });
      transaction.addEventListener("error", () => {
        reject(transaction.error);
      });
    });
  }

  close() {
    this.database.close();
  }
}
