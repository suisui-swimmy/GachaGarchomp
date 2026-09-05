const ASSETS = {
  bodyClosed: "./assets/garchomp-body.svg",
  bodyOpen: "./assets/garchomp-mouthopen.svg",
  armIdle: "./assets/garchomp-arm-idle.svg",
  armPulled: "./assets/garchomp-arm-pulled.svg",
  ballClosed: "./assets/pokeball-close.svg",
  ballOpen: "./assets/pokeball-open.svg",
  ballOpenEffect: "./assets/pokeball-open-effect.svg",
  steam: "./assets/steam.svg",
};

const BALL_END_POINT = {
  x: 1.0449,
  y: 0.8623,
};

const OPEN_BALL_PREVIEW_MS = 560;
const IDLE_BEFORE_REPULL_MS = 420;
const DISPENSE_BALL_MIN_MS = 1180;
const DISPENSE_BALL_FALLBACK_MS = 1400;
const RESULT_SPRITE_TIMEOUT_MS = 12000;
const FLASH_EFFECT_WHITE_RADIUS = 50;
const FLASH_EFFECT_MARGIN = 120;

const DATA_SOURCES = {
  sprites: "./assets/sprites/mega-sprites.json",
  pools: {
    all: [
      "./assets/gacha-pools/regulation-m-a.json",
      "./assets/gacha-pools/regulation-m-b.json",
      "./assets/gacha-pools/regulation-m-c.json",
    ],
    new: ["./assets/gacha-pools/regulation-m-c.json"],
  },
};

const DEFAULT_DRAW_MODE = "all";
const DRAW_MODES = {
  all: {
    chip: "全部",
  },
  new: {
    chip: "M-C暫定新規",
  },
};

const SHARE_BASE_URL = "https://suisui-swimmy.github.io/GachaGarchomp/";
const SHARE_IMAGE = {
  width: 1080,
  height: 1080,
  mimeType: "image/png",
  fileName: "gachagarchomp-result.png",
};
const SHARE_CARD = {
  x: 70,
  y: 80,
  width: 940,
  height: 920,
};
const SHARE_IMAGE_FONT = '"DotGothic16", "Hiragino Sans", "Yu Gothic UI", "Yu Gothic", Meiryo, sans-serif';

const machine = document.querySelector("#gachaMachine");
const drawButtons = Array.from(document.querySelectorAll("[data-draw-mode]"));
const leverButton = document.querySelector("#leverButton");
const resultPanel = document.querySelector("#resultPanel");
const resultName = document.querySelector("#resultName");
let resultSprite = document.querySelector("#resultSprite");
const resultText = document.querySelector("#resultText");
const partyList = document.querySelector("#partyList");
const shareButton = document.querySelector("#shareButton");
const downloadButton = document.querySelector("#downloadButton");
const copyButton = document.querySelector("#copyButton");
const closedBallElement = document.querySelector(".ball-closed");
const openBallElement = document.querySelector(".ball-open");
const screenFlashEffect = document.querySelector("#screenFlashEffect");

let isDrawing = false;
let lastApiNameByMode = {};
let gachaPools = {};
let currentResult = null;
let currentDrawMode = DEFAULT_DRAW_MODE;
let resultImageFile = null;
let resultImagePromise = null;
let resultImageApiName = "";
const shareFeedbackTimers = new WeakMap();

function setAssetSources() {
  document.querySelector(".body-closed").src = ASSETS.bodyClosed;
  document.querySelector(".body-open").src = ASSETS.bodyOpen;
  document.querySelector(".arm-idle").src = ASSETS.armIdle;
  document.querySelector(".arm-pulled").src = ASSETS.armPulled;
  closedBallElement.src = ASSETS.ballClosed;
  openBallElement.src = ASSETS.ballOpen;
  screenFlashEffect.src = ASSETS.ballOpenEffect;
  document.querySelectorAll(".steam").forEach((steam) => {
    steam.src = ASSETS.steam;
  });
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function normalizeDisplayName(name) {
  return name.replaceAll("Ｘ", "X").replaceAll("Ｙ", "Y");
}

function mergePoolEntries(poolConfigs) {
  const entriesByApiName = new Map();

  poolConfigs.forEach((poolConfig) => {
    const entries = poolConfig && Array.isArray(poolConfig.entries) ? poolConfig.entries : [];

    entries.forEach((entry) => {
      if (entry.apiName && !entriesByApiName.has(entry.apiName)) {
        entriesByApiName.set(entry.apiName, entry);
      }
    });
  });

  return Array.from(entriesByApiName.values());
}

function buildGachaPool(sprites, poolEntries) {
  const spritesByApiName = new Map(sprites.map((sprite) => [sprite.apiName, sprite]));

  return poolEntries
    .map((entry) => {
      const sprite = spritesByApiName.get(entry.apiName);
      const weight = Number(entry.weight);

      if (!sprite || !Number.isFinite(weight) || weight <= 0) {
        return null;
      }

      return {
        ...sprite,
        name: normalizeDisplayName(sprite.name),
        weight,
      };
    })
    .filter(Boolean);
}

function getDrawModeMeta(mode) {
  return DRAW_MODES[mode] || DRAW_MODES[DEFAULT_DRAW_MODE];
}

function getPoolForMode(mode) {
  return gachaPools[mode] || [];
}

function findResultByApiName(apiName) {
  const pools = Object.values(gachaPools);

  for (const pool of pools) {
    const result = pool.find((item) => item.apiName === apiName);
    if (result) {
      return result;
    }
  }

  return null;
}

async function loadPoolConfigs(poolUrls) {
  const configs = await Promise.all(
    poolUrls.map(async (poolUrl) => {
      const poolConfig = await loadJson(poolUrl);
      return [poolUrl, poolConfig];
    }),
  );

  return new Map(configs);
}

async function loadGachaPools() {
  const poolUrls = Array.from(new Set(Object.values(DATA_SOURCES.pools).flat()));
  const [sprites, poolConfigsByUrl] = await Promise.all([loadJson(DATA_SOURCES.sprites), loadPoolConfigs(poolUrls)]);

  gachaPools = Object.fromEntries(
    Object.entries(DATA_SOURCES.pools).map(([mode, poolConfigUrls]) => {
      const poolConfigs = poolConfigUrls.map((poolConfigUrl) => poolConfigsByUrl.get(poolConfigUrl));
      const poolEntries = mergePoolEntries(poolConfigs);
      return [mode, buildGachaPool(sprites, poolEntries)];
    }),
  );

  const emptyMode = Object.keys(DRAW_MODES).find((mode) => getPoolForMode(mode).length === 0);
  if (emptyMode) {
    throw new Error(`No drawable Pokemon in the ${emptyMode} gacha pool.`);
  }

  const allCount = getPoolForMode("all").length;
  const newCount = getPoolForMode("new").length;

  resultName.textContent = "準備OK";
  resultText.textContent = `全部 ${allCount}種類 / 新規追加(M-C暫定) ${newCount}種類から抽選できます。`;
  renderChips([`全部 ${allCount}種類`, `M-C暫定新規 ${newCount}種類`, "weight編集対応"]);
}

function getResultFromUrl() {
  const apiName = new URLSearchParams(window.location.search).get("result");
  return apiName ? findResultByApiName(apiName) : null;
}

function pickResult(mode) {
  const pool = getPoolForMode(mode);

  if (pool.length === 1) {
    lastApiNameByMode[mode] = pool[0].apiName;
    return pool[0];
  }

  let picked = null;
  let guard = 0;
  const lastApiName = lastApiNameByMode[mode] || "";

  while ((!picked || picked.apiName === lastApiName) && guard < 12) {
    const totalWeight = pool.reduce((sum, result) => sum + result.weight, 0);
    let cursor = Math.random() * totalWeight;

    picked = pool[pool.length - 1];
    for (const result of pool) {
      cursor -= result.weight;
      if (cursor <= 0) {
        picked = result;
        break;
      }
    }

    guard += 1;
  }

  lastApiNameByMode[mode] = picked.apiName;
  return picked;
}

function renderChips(labels) {
  partyList.replaceChildren(
    ...labels.map((label) => {
      const chip = document.createElement("span");
      chip.className = "party-chip";
      chip.textContent = label;
      return chip;
    }),
  );
}

function updateShareControls() {
  const canShare = Boolean(currentResult) && !isDrawing;
  shareButton.disabled = !canShare;
  downloadButton.disabled = !canShare || resultSprite.hidden;
  copyButton.disabled = !canShare;
}

function buildCurrentResultUrl() {
  const url = new URL(window.location.href);

  if (currentResult) {
    url.searchParams.set("result", currentResult.apiName);
  } else {
    url.searchParams.delete("result");
  }

  return url.toString();
}

function buildPublicResultUrl(result = currentResult) {
  const url = new URL(SHARE_BASE_URL);

  if (result) {
    url.searchParams.set("result", result.apiName);
  }

  return url.toString();
}

function buildShareText(result = currentResult) {
  if (!result) {
    return `GachaGarchompで今日のメガシンカを引こう！\n#GachaGarchomp ${SHARE_BASE_URL}`;
  }

  return `今日のメガシンカは${result.name}！\n#GachaGarchomp ${buildPublicResultUrl(result)}`;
}

function setCanvasFont(context, size, weight = 400) {
  context.font = `${weight} ${size}px ${SHARE_IMAGE_FONT}`;
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawFittedText(context, text, x, y, maxWidth, options = {}) {
  const align = options.align || "center";
  const color = options.color || "#292c18";
  const minSize = options.minSize || 24;
  const weight = options.weight || 400;
  let size = options.size || 48;

  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillStyle = color;
  setCanvasFont(context, size, weight);

  while (size > minSize && context.measureText(text).width > maxWidth) {
    size -= 2;
    setCanvasFont(context, size, weight);
  }

  context.fillText(text, x, y);
}

function drawResultCardBackground(context) {
  context.fillStyle = "#cfd2ab";
  context.fillRect(0, 0, SHARE_IMAGE.width, SHARE_IMAGE.height);

  context.strokeStyle = "rgba(41, 44, 24, 0.18)";
  context.lineWidth = 2;
  for (let position = 0; position <= SHARE_IMAGE.width; position += 32) {
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, SHARE_IMAGE.height);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(SHARE_IMAGE.width, position);
    context.stroke();
  }
}

function drawResultCardFrame(context) {
  const { x, y, width, height } = SHARE_CARD;

  context.fillStyle = "rgba(41, 44, 24, 0.38)";
  drawRoundedRect(context, x + 14, y + 18, width, height, 12);
  context.fill();

  context.fillStyle = "#cfd2ab";
  drawRoundedRect(context, x, y, width, height, 12);
  context.fill();

  context.strokeStyle = "#292c18";
  context.lineWidth = 8;
  drawRoundedRect(context, x, y, width, height, 12);
  context.stroke();

  context.strokeStyle = "rgba(41, 44, 24, 0.72)";
  context.lineWidth = 3;
  drawRoundedRect(context, x + 22, y + 22, width - 44, height - 44, 4);
  context.stroke();
}

function loadImageForCanvas(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = new URL(src, window.location.href).toString();
  });
}

function drawImageContained(context, image, centerX, centerY, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;

  context.drawImage(image, centerX - width / 2, centerY - height / 2, width, height);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Result image generation failed."));
      }
    }, SHARE_IMAGE.mimeType);
  });
}

function buildResultImageFileName(result = currentResult) {
  return result ? `gachagarchomp-${result.apiName}.png` : SHARE_IMAGE.fileName;
}

async function buildResultImageFile(result = currentResult, preparedSprite = null) {
  if (!result) {
    return null;
  }

  if (typeof File === "undefined") {
    return null;
  }

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const sprite = preparedSprite || await loadImageForCanvas(result.src);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_IMAGE.width;
  canvas.height = SHARE_IMAGE.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  drawResultCardBackground(context);
  drawResultCardFrame(context);

  drawFittedText(context, "今日のメガシンカ", SHARE_IMAGE.width / 2, 206, 760, {
    size: 56,
    minSize: 34,
    weight: 700,
  });
  drawFittedText(context, result.name, SHARE_IMAGE.width / 2, 306, 840, {
    size: 86,
    minSize: 44,
    weight: 700,
  });
  drawImageContained(context, sprite, SHARE_IMAGE.width / 2, 612, 680, 520);
  drawFittedText(context, "#GachaGarchomp", SHARE_IMAGE.width / 2, 884, 820, {
    size: 52,
    minSize: 30,
    weight: 700,
  });

  const blob = await canvasToBlob(canvas);
  return new File([blob], buildResultImageFileName(result), { type: SHARE_IMAGE.mimeType });
}

function prepareResultImage(result, sprite) {
  resultImageFile = null;
  resultImageApiName = result.apiName;
  resultImagePromise = (sprite ? buildResultImageFile(result, sprite) : Promise.resolve(null))
    .then((file) => {
      if (currentResult?.apiName === result.apiName) {
        resultImageFile = file;
      }

      return file;
    })
    .catch((error) => {
      if (currentResult?.apiName === result.apiName) {
        resultImageFile = null;
      }

      console.warn("Result image generation failed.", error);
      return null;
    });
}

async function getPreparedResultImageFile() {
  if (!currentResult) {
    return null;
  }

  if (resultImageApiName === currentResult.apiName) {
    if (resultImageFile) {
      return resultImageFile;
    }

    if (resultImagePromise) {
      return resultImagePromise;
    }
  }

  return buildResultImageFile(currentResult);
}

function canShareFiles(files) {
  if (!navigator.canShare) {
    return false;
  }

  try {
    return navigator.canShare({ files });
  } catch (error) {
    return false;
  }
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.warn("Clipboard API failed. Falling back to textarea copy.", error);
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Copy command failed.");
  }
}

function showShareFeedback(button, label) {
  const currentTimer = shareFeedbackTimers.get(button);
  if (currentTimer) {
    window.clearTimeout(currentTimer);
  }

  button.dataset.feedback = label;
  button.classList.add("is-feedback");
  const nextTimer = window.setTimeout(() => {
    button.classList.remove("is-feedback");
    delete button.dataset.feedback;
    shareFeedbackTimers.delete(button);
  }, 1100);
  shareFeedbackTimers.set(button, nextTimer);
}

function syncResultUrl() {
  if (!currentResult) {
    return;
  }

  window.history.replaceState(null, "", buildCurrentResultUrl());
}

function renderResult(result, mode = currentDrawMode, sprite = null) {
  currentDrawMode = mode;
  currentResult = result;
  const modeMeta = getDrawModeMeta(mode);
  resultName.textContent = result.name;
  // Insert the decoded image itself so the previous image cannot remain painted.
  const nextSprite = sprite || new Image();
  nextSprite.id = "resultSprite";
  nextSprite.className = "result-sprite";
  nextSprite.alt = sprite ? result.name : "";
  nextSprite.hidden = !sprite;
  resultSprite.replaceWith(nextSprite);
  resultSprite = nextSprite;
  resultText.textContent = sprite ? "#GachaGarchomp" : "画像を読み込めませんでした。再読み込みで再試行できます。";
  renderChips([modeMeta.chip, result.apiName, `weight ${result.weight}`]);
  prepareResultImage(result, sprite);
  resultPanel.classList.add("has-result");
  resultPanel.classList.remove("is-entering");
  void resultPanel.offsetWidth;
  resultPanel.classList.add("is-entering");
  updateShareControls();
  syncResultUrl();
}

function setBusy(nextBusy) {
  isDrawing = nextBusy;
  drawButtons.forEach((button) => {
    const mode = button.dataset.drawMode || DEFAULT_DRAW_MODE;
    button.disabled = nextBusy || getPoolForMode(mode).length === 0;
  });
  leverButton.disabled = nextBusy || getPoolForMode(DEFAULT_DRAW_MODE).length === 0;
  document.body.classList.toggle("is-busy", nextBusy);
  updateShareControls();
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForAnimationEnd(element, animationName, fallbackMs) {
  return new Promise((resolve) => {
    let isResolved = false;

    const cleanup = () => {
      element.removeEventListener("animationend", handleAnimationEnd);
    };

    const finish = () => {
      if (isResolved) {
        return;
      }

      isResolved = true;
      cleanup();
      resolve();
    };

    const handleAnimationEnd = (event) => {
      if (event.target === element && event.animationName === animationName) {
        finish();
      }
    };

    element.addEventListener("animationend", handleAnimationEnd);
    window.setTimeout(finish, fallbackMs);
  });
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
  });
}

function loadResultSprite(result) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = (sprite) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      if (!sprite) {
        image.removeAttribute("src");
      }
      resolve(sprite);
    };

    const timeoutId = window.setTimeout(() => finish(null), RESULT_SPRITE_TIMEOUT_MS);
    image.decoding = "async";
    image.onload = async () => {
      try {
        if (typeof image.decode === "function") {
          await image.decode();
        }
        finish(image.naturalWidth > 0 ? image : null);
      } catch {
        finish(null);
      }
    };
    image.onerror = () => finish(null);
    image.src = result.src;
  });
}

function setFlashOrigin() {
  const machineRect = machine.getBoundingClientRect();
  const originX = machineRect.left + machineRect.width * BALL_END_POINT.x;
  const originY = machineRect.top + machineRect.height * BALL_END_POINT.y;
  const farthestCorner = Math.max(
    Math.hypot(originX, originY),
    Math.hypot(window.innerWidth - originX, originY),
    Math.hypot(originX, window.innerHeight - originY),
    Math.hypot(window.innerWidth - originX, window.innerHeight - originY),
  );
  const flashScale = (farthestCorner + FLASH_EFFECT_MARGIN) / FLASH_EFFECT_WHITE_RADIUS;

  document.documentElement.style.setProperty("--flash-origin-x", `${originX}px`);
  document.documentElement.style.setProperty("--flash-origin-y", `${originY}px`);
  document.documentElement.style.setProperty("--flash-scale", Math.max(flashScale, 18).toFixed(2));
}

async function drawGacha(mode = DEFAULT_DRAW_MODE) {
  const pool = getPoolForMode(mode);

  if (isDrawing || pool.length === 0) {
    return;
  }

  setBusy(true);
  currentDrawMode = mode;
  const isRedraw = machine.dataset.state === "result";
  const result = pickResult(mode);
  const spritePromise = loadResultSprite(result);
  resultPanel.classList.remove("has-result", "is-entering");
  document.body.classList.remove("is-flashing", "is-whiteout-exiting");

  machine.dataset.state = "idle";
  if (isRedraw) {
    await waitForNextPaint();
    await wait(IDLE_BEFORE_REPULL_MS);
  }
  machine.dataset.state = "pulled";
  await wait(300);
  machine.dataset.state = "pulling";
  await wait(1000);
  machine.dataset.state = "dispensing";
  await Promise.all([wait(DISPENSE_BALL_MIN_MS), waitForAnimationEnd(closedBallElement, "dispenseBall", DISPENSE_BALL_FALLBACK_MS)]);
  machine.dataset.state = "opening";
  setFlashOrigin();
  await waitForNextPaint();
  const [sprite] = await Promise.all([spritePromise, wait(OPEN_BALL_PREVIEW_MS)]);
  machine.dataset.state = "flash";
  document.body.classList.add("is-flashing");
  await wait(760);
  renderResult(result, mode, sprite);
  machine.dataset.state = "result";
  document.body.classList.remove("is-flashing");
  document.body.classList.add("is-whiteout-exiting");
  await wait(280);
  document.body.classList.remove("is-whiteout-exiting");
  setBusy(false);
}

async function init() {
  setAssetSources();
  drawButtons.forEach((button) => {
    button.disabled = true;
  });
  leverButton.disabled = true;
  updateShareControls();

  try {
    await Promise.all([preloadImage(ASSETS.ballClosed), preloadImage(ASSETS.ballOpen), preloadImage(ASSETS.ballOpenEffect), loadGachaPools()]);
    const urlResult = getResultFromUrl();
    if (urlResult) {
      lastApiNameByMode[DEFAULT_DRAW_MODE] = urlResult.apiName;
      const sprite = await loadResultSprite(urlResult);
      machine.dataset.state = "result";
      renderResult(urlResult, DEFAULT_DRAW_MODE, sprite);
    }
  } catch (error) {
    console.error(error);
    resultName.textContent = "読み込み失敗";
    resultText.textContent = "メガシンカの排出プールを読み込めませんでした。ローカル確認時はHTTPサーバー経由で開いてください。";
    renderChips(["JSON読み込みエラー"]);
  } finally {
    setBusy(false);
  }
}

async function shareResult() {
  if (!currentResult) {
    return;
  }

  const text = buildShareText();
  let imageFile = null;
  shareButton.disabled = true;
  showShareFeedback(shareButton, "生成中");

  try {
    imageFile = await getPreparedResultImageFile();
  } catch (error) {
    console.warn("Result image generation failed. Falling back to text share.", error);
  }

  if (navigator.share) {
    const shareData = {
      title: "GachaGarchomp",
      text,
    };

    if (imageFile && canShareFiles([imageFile])) {
      shareData.files = [imageFile];
    }

    try {
      await navigator.share(shareData);
      showShareFeedback(shareButton, "共有済");
      updateShareControls();
      return;
    } catch (error) {
      if (error.name === "AbortError") {
        updateShareControls();
        return;
      }
      console.warn("Web Share failed. Falling back to clipboard copy.", error);
    }
  }

  try {
    await copyText(text);
    showShareFeedback(shareButton, "コピー済");
  } catch (error) {
    console.error(error);
    showShareFeedback(shareButton, "失敗");
  } finally {
    updateShareControls();
  }
}

async function copyShareText() {
  if (!currentResult) {
    return;
  }

  try {
    await copyText(buildShareText());
    showShareFeedback(copyButton, "コピー済");
  } catch (error) {
    console.error(error);
    showShareFeedback(copyButton, "失敗");
  }
}

async function downloadResultImage() {
  if (!currentResult) {
    return;
  }

  downloadButton.disabled = true;
  showShareFeedback(downloadButton, "生成中");

  try {
    const imageFile = await getPreparedResultImageFile();

    if (!imageFile) {
      throw new Error("Result image is unavailable.");
    }

    const url = URL.createObjectURL(imageFile);
    const link = document.createElement("a");
    link.href = url;
    link.download = imageFile.name || buildResultImageFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    showShareFeedback(downloadButton, "保存");
  } catch (error) {
    console.error(error);
    showShareFeedback(downloadButton, "失敗");
  } finally {
    updateShareControls();
  }
}

drawButtons.forEach((button) => {
  button.addEventListener("click", () => {
    drawGacha(button.dataset.drawMode || DEFAULT_DRAW_MODE);
  });
});
leverButton.addEventListener("click", () => drawGacha(DEFAULT_DRAW_MODE));
shareButton.addEventListener("click", shareResult);
downloadButton.addEventListener("click", downloadResultImage);
copyButton.addEventListener("click", copyShareText);
init();
