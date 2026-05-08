const ASSETS = {
  bodyClosed: "./assets/garchomp-body.svg",
  bodyOpen: "./assets/garchomp-mouthopen.svg",
  armIdle: "./assets/garchomp-arm-idle.svg",
  armPulled: "./assets/garchomp-arm-pulled.svg",
  ballClosed: "./assets/pokeball-close.svg",
  ballOpen: "./assets/pokeball-open.svg",
  ballOpenEffect: "./assets/pokeball-open-effect.svg",
  sparkle: "./assets/sparkle.svg",
};

const BALL_END_POINT = {
  x: 1.0449,
  y: 0.8623,
};

const OPEN_BALL_PREVIEW_MS = 560;
const IDLE_BEFORE_REPULL_MS = 420;
const DISPENSE_BALL_MIN_MS = 1180;
const DISPENSE_BALL_FALLBACK_MS = 1400;
const FLASH_EFFECT_WHITE_RADIUS = 50;
const FLASH_EFFECT_MARGIN = 120;

const DATA_SOURCES = {
  sprites: "./assets/sprites/mega-sprites.json",
  pool: "./assets/gacha-pools/regulation-m-a.json",
};

const machine = document.querySelector("#gachaMachine");
const drawButton = document.querySelector("#drawButton");
const leverButton = document.querySelector("#leverButton");
const resultPanel = document.querySelector("#resultPanel");
const resultName = document.querySelector("#resultName");
const resultSprite = document.querySelector("#resultSprite");
const resultText = document.querySelector("#resultText");
const partyList = document.querySelector("#partyList");
const shareXButton = document.querySelector("#shareXButton");
const shareDiscordButton = document.querySelector("#shareDiscordButton");
const shareUrlButton = document.querySelector("#shareUrlButton");
const closedBallElement = document.querySelector(".ball-closed");
const openBallElement = document.querySelector(".ball-open");
const screenFlashEffect = document.querySelector("#screenFlashEffect");

let isDrawing = false;
let lastApiName = "";
let gachaPool = [];
let currentResult = null;
let activePoolLabel = "レギュレーションM-A";

function setAssetSources() {
  document.querySelector(".body-closed").src = ASSETS.bodyClosed;
  document.querySelector(".body-open").src = ASSETS.bodyOpen;
  document.querySelector(".arm-idle").src = ASSETS.armIdle;
  document.querySelector(".arm-pulled").src = ASSETS.armPulled;
  closedBallElement.src = ASSETS.ballClosed;
  openBallElement.src = ASSETS.ballOpen;
  screenFlashEffect.src = ASSETS.ballOpenEffect;
  document.querySelectorAll(".sparkle").forEach((sparkle) => {
    sparkle.src = ASSETS.sparkle;
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

function buildGachaPool(sprites, poolConfig) {
  const spritesByApiName = new Map(sprites.map((sprite) => [sprite.apiName, sprite]));

  return poolConfig.entries
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

function findResultByApiName(apiName) {
  return gachaPool.find((result) => result.apiName === apiName) || null;
}

async function loadGachaPool() {
  const [sprites, poolConfig] = await Promise.all([loadJson(DATA_SOURCES.sprites), loadJson(DATA_SOURCES.pool)]);
  activePoolLabel = poolConfig.label || poolConfig.regulation || activePoolLabel;
  gachaPool = buildGachaPool(sprites, poolConfig);

  if (gachaPool.length === 0) {
    throw new Error("No drawable Pokemon in the active gacha pool.");
  }

  resultName.textContent = "準備OK";
  resultText.textContent = `${activePoolLabel}で使えるメガシンカ ${gachaPool.length}種類から抽選します。`;
  renderChips(["M-A", `${gachaPool.length}種類`, "weight編集対応"]);
}

function getResultFromUrl() {
  const apiName = new URLSearchParams(window.location.search).get("result");
  return apiName ? findResultByApiName(apiName) : null;
}

function pickResult() {
  if (gachaPool.length === 1) {
    lastApiName = gachaPool[0].apiName;
    return gachaPool[0];
  }

  let picked = null;
  let guard = 0;

  while ((!picked || picked.apiName === lastApiName) && guard < 12) {
    const totalWeight = gachaPool.reduce((sum, result) => sum + result.weight, 0);
    let cursor = Math.random() * totalWeight;

    picked = gachaPool[gachaPool.length - 1];
    for (const result of gachaPool) {
      cursor -= result.weight;
      if (cursor <= 0) {
        picked = result;
        break;
      }
    }

    guard += 1;
  }

  lastApiName = picked.apiName;
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
  const canShare = Boolean(currentResult);
  shareXButton.disabled = !canShare;
  shareDiscordButton.disabled = !canShare;
  shareUrlButton.disabled = !canShare;
}

function buildResultUrl() {
  const url = new URL(window.location.href);

  if (currentResult) {
    url.searchParams.set("result", currentResult.apiName);
  } else {
    url.searchParams.delete("result");
  }

  return url.toString();
}

function buildShareText() {
  if (!currentResult) {
    return "GachaGarchompで今日のメガシンカを引こう！";
  }

  return `今日のメガシンカは${currentResult.name}！\n${activePoolLabel}で排出されました。\n#GachaGarchomp`;
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
  const defaultLabel = button.textContent;
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = defaultLabel;
  }, 1100);
}

function syncResultUrl() {
  if (!currentResult) {
    return;
  }

  window.history.replaceState(null, "", buildResultUrl());
}

function renderResult(result) {
  currentResult = result;
  resultName.textContent = result.name;
  resultSprite.src = result.src;
  resultSprite.alt = result.name;
  resultText.textContent = `${activePoolLabel}で排出されました。`;
  renderChips([result.apiName, `weight ${result.weight}`]);
  resultPanel.classList.add("has-result");
  resultPanel.classList.remove("is-entering");
  void resultPanel.offsetWidth;
  resultPanel.classList.add("is-entering");
  updateShareControls();
  syncResultUrl();
}

function setBusy(nextBusy) {
  isDrawing = nextBusy;
  drawButton.disabled = nextBusy || gachaPool.length === 0;
  leverButton.disabled = nextBusy || gachaPool.length === 0;
  document.body.classList.toggle("is-busy", nextBusy);
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

async function drawGacha() {
  if (isDrawing || gachaPool.length === 0) {
    return;
  }

  setBusy(true);
  const isRedraw = machine.dataset.state === "result";
  const result = pickResult();
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
  await wait(OPEN_BALL_PREVIEW_MS);
  machine.dataset.state = "flash";
  document.body.classList.add("is-flashing");
  await wait(760);
  renderResult(result);
  machine.dataset.state = "result";
  document.body.classList.remove("is-flashing");
  document.body.classList.add("is-whiteout-exiting");
  await wait(280);
  document.body.classList.remove("is-whiteout-exiting");
  setBusy(false);
}

async function init() {
  setAssetSources();
  drawButton.disabled = true;
  leverButton.disabled = true;
  updateShareControls();

  try {
    await Promise.all([preloadImage(ASSETS.ballClosed), preloadImage(ASSETS.ballOpen), preloadImage(ASSETS.ballOpenEffect), loadGachaPool()]);
    const urlResult = getResultFromUrl();
    if (urlResult) {
      lastApiName = urlResult.apiName;
      machine.dataset.state = "result";
      renderResult(urlResult);
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

function shareToX() {
  if (!currentResult) {
    return;
  }

  const intentUrl = new URL("https://twitter.com/intent/tweet");
  intentUrl.searchParams.set("text", buildShareText());
  intentUrl.searchParams.set("url", buildResultUrl());
  window.open(intentUrl.toString(), "_blank", "noopener,noreferrer");
}

async function shareToDiscord() {
  if (!currentResult) {
    return;
  }

  const text = buildShareText();
  const url = buildResultUrl();

  if (navigator.share) {
    try {
      await navigator.share({
        title: "GachaGarchomp",
        text,
        url,
      });
      return;
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }
    }
  }

  try {
    await copyText(`${text}\n${url}`);
    showShareFeedback(shareDiscordButton, "コピー済");
  } catch (error) {
    console.error(error);
    showShareFeedback(shareDiscordButton, "失敗");
  }
}

async function copyResultUrl() {
  if (!currentResult) {
    return;
  }

  try {
    await copyText(buildResultUrl());
    showShareFeedback(shareUrlButton, "コピー済");
  } catch (error) {
    console.error(error);
    showShareFeedback(shareUrlButton, "失敗");
  }
}

drawButton.addEventListener("click", drawGacha);
leverButton.addEventListener("click", drawGacha);
shareXButton.addEventListener("click", shareToX);
shareDiscordButton.addEventListener("click", shareToDiscord);
shareUrlButton.addEventListener("click", copyResultUrl);
init();
